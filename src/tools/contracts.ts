import { z } from 'zod';
import { checkResponseSizeLimit } from '../security/resourceLimits.js';
import { wrapError } from '../utils/jsonHelper.js';

export interface ToolResult extends Record<string, unknown> {
    content: { type: 'text'; text: string }[];
    structuredContent: {
        success: boolean;
        result?: unknown;
        error?: { message: string; type: string; details?: Record<string, unknown> };
    };
    isError?: boolean;
}

export interface ToolAnnotations {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
}

export interface ToolDraft {
    name?: string;
    title?: string;
    description: string;
    inputSchema: z.ZodObject;
    handler: (args: any) => Promise<ToolResult>;
}

export interface ToolDefinition extends ToolDraft {
    outputSchema: z.ZodObject;
    annotations: ToolAnnotations;
}

export const readOnlyAnnotations: ToolAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
};

// Authorization is configurable. An execution tool cannot promise read-only
// behavior merely because the default policy rejects writes.
export const sqlExecutionAnnotations: ToolAnnotations = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true
};

const ErrorSchema = z.object({
    message: z.string(),
    type: z.string(),
    details: z.record(z.string(), z.json()).optional()
});

export function toolOutputSchema(resultSchema: z.ZodType): z.ZodObject {
    return z.object({
        success: z.boolean().describe('False for tool failures, including partially failed batches'),
        result: resultSchema.optional().describe('The legacy JSON payload; present for completed operations and partial batches'),
        error: ErrorSchema.optional().describe('Failure information; present when success is false')
    });
}

/** Preserve text-only clients while exposing a predictable object to MCP clients. */
export function toolResult(
    result: unknown,
    options: { prefix?: string; text?: string; isError?: boolean; error?: string } = {}
): ToolResult {
    // Serialize once, deliberately without swallowing serialization errors. This
    // normalizes Dates/Buffers exactly as the legacy JSON text did. A non-JSON
    // result must become an error rather than a misleading successful response.
    const json = JSON.stringify(result, null, 2);
    if (json === undefined) throw new Error('Tool returned a result that cannot be represented as JSON');
    const isError = options.isError === true;
    return {
        content: [{ type: 'text', text: options.text ?? `${options.prefix ?? ''}${json}` }],
        structuredContent: {
            success: !isError,
            result: JSON.parse(json),
            ...(isError ? { error: { message: options.error || 'Tool operation failed', type: 'TOOL_EXECUTION_ERROR' } } : {})
        },
        ...(isError ? { isError: true } : {})
    };
}

export function toolError(error: unknown, options: { text?: string; compact?: boolean } = {}): ToolResult {
    const wrapped = wrapError(error);
    // Error context may itself contain non-serializable driver objects. Retain
    // serializable details, but never allow error reporting to throw recursively.
    let details: Record<string, unknown> | undefined;
    try {
        if (wrapped.errorDetails) details = JSON.parse(JSON.stringify(wrapped.errorDetails));
    } catch { /* The message and type remain available without unsafe details. */ }
    const safeError = { ...wrapped, errorDetails: details };
    return {
        content: [{ type: 'text', text: options.text ?? JSON.stringify(safeError, null, options.compact ? undefined : 2) }],
        structuredContent: {
            success: false,
            error: {
                message: wrapped.error || 'Tool operation failed',
                type: wrapped.errorType || 'UNKNOWN_ERROR',
                ...(details ? { details } : {})
            }
        },
        isError: true
    };
}

/** Add schemas, annotations and the final execution/serialization/size boundary. */
export function finalizeTools(
    drafts: Map<string, ToolDraft>,
    resultSchemas: Record<string, z.ZodType>,
    executionTools: ReadonlySet<string> = new Set()
): Map<string, ToolDefinition> {
    const tools = new Map<string, ToolDefinition>();
    for (const [name, draft] of drafts) {
        const resultSchema = resultSchemas[name];
        if (!resultSchema) throw new Error(`Missing output schema for tool: ${name}`);
        const outputSchema = toolOutputSchema(resultSchema);
        tools.set(name, {
            ...draft,
            name,
            outputSchema,
            annotations: { ...(executionTools.has(name) ? sqlExecutionAnnotations : readOnlyAnnotations) },
            handler: async args => {
                try {
                    const result = await draft.handler(args);
                    outputSchema.parse(result.structuredContent);
                    checkResponseSizeLimit(result);
                    return result;
                } catch (error) {
                    // Includes failures outside a tool's local try block, output
                    // serialization, and the complete MCP response size check.
                    return toolError(error);
                }
            }
        });
    }
    return tools;
}
