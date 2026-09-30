/** One server definition shared by every entry point and protocol era. */
import { McpServer, type GetPromptResult, type McpRequestContext } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { setupDatabaseTools } from '../tools/database.js';
import { setupMetadataTools } from '../tools/metadata.js';
import { setupSimpleTools } from '../tools/simple.js';
import { setupDatabasePrompts } from '../prompts/database.js';
import { setupSqlPrompts } from '../prompts/sql.js';
import { setupTemplatePrompts } from '../prompts/templates.js';
import { setupAdvancedTemplatePrompts } from '../prompts/advanced-templates.js';
import { registerDatabaseResources } from '../resources/database.js';
import { setupEventResources, closeEventManager } from '../resources/events.js';
import { initSecurity } from '../security/index.js';
import { closePool } from '../db/connection.js';
import { createLogger } from '../utils/logger.js';
import { createHttpApplication } from './http-server.js';
import { loadHttpSecurityConfig } from './http-security.js';
import pkg from '../../package.json' with { type: 'json' };

const logger = createLogger('server');

export async function createMcpServerInstance(context?: McpRequestContext): Promise<McpServer> {
    const server = new McpServer({ name: pkg.name, version: pkg.version });
    const databaseTools = setupDatabaseTools();
    const tools = new Map([...databaseTools, ...setupMetadataTools(databaseTools), ...setupSimpleTools()]);
    for (const [name, tool] of tools) {
        server.registerTool(name, {
            title: tool.title || name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
            annotations: tool.annotations
        }, async args => {
            try { return await tool.handler(args); }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown tool error';
                return { isError: true, content: [{ type: 'text' as const, text: message }] };
            }
        });
    }
    const prompts = new Map([
        ...setupDatabasePrompts(), ...setupSqlPrompts(),
        ...setupTemplatePrompts(), ...setupAdvancedTemplatePrompts()
    ]);
    for (const [name, prompt] of prompts) {
        server.registerPrompt(name, {
            title: prompt.title || name, description: prompt.description,
            argsSchema: prompt.inputSchema
        }, async args => await prompt.handler(args) as GetPromptResult);
    }
    registerDatabaseResources(server);
    setupEventResources(server, { era: context?.era || 'legacy', eventLifetime: context?.requestInfo ? 'request' : 'connection' });
    return server;
}

export async function main(): Promise<void> {
    await initSecurity();
    const transport = (process.env.TRANSPORT_TYPE || 'stdio').toLowerCase();
    let close: () => Promise<void>;
    if (transport === 'stdio') {
        const handle = serveStdio(createMcpServerInstance, { onerror: error => logger.error(error.message) });
        close = () => handle.close();
    } else if (['http', 'sse', 'unified'].includes(transport)) {
        const config = loadHttpSecurityConfig();
        const value = process.env.PORT || (transport === 'sse'
            ? process.env.SSE_PORT || process.env.HTTP_PORT
            : process.env.HTTP_PORT || process.env.SSE_PORT) || '3003';
        const port = Number(value);
        if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid HTTP port: ${value}`);
        const http = createHttpApplication(createMcpServerInstance, config);
        const listener = await new Promise<ReturnType<typeof http.app.listen>>((resolve, reject) => {
            const listener = http.app.listen(port, config.host, () => resolve(listener));
            listener.once('error', reject);
        });
        logger.info(`MCP HTTP server listening on ${config.host}:${port} (/mcp, /sse)`);
        close = async () => {
            await http.close();
            await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
        };
    } else throw new Error(`Unsupported transport: ${transport}. Use stdio, http, sse, or unified.`);
    let closing = false;
    const cleanup = async () => {
        if (closing) return;
        closing = true;
        const results = await Promise.allSettled([close(), Promise.resolve(closeEventManager()), closePool()]);
        const failed = results.find(result => result.status === 'rejected');
        if (failed?.status === 'rejected') throw failed.reason;
    };
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => { void cleanup().then(() => process.exit(0), error => {
            logger.error(`Shutdown failed: ${String(error)}`); process.exit(1);
        }); });
    }
    if (transport === 'stdio') process.stdin.once('end', () => { void cleanup().catch(error => logger.error(String(error))); });
}
