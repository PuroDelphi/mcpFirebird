// src/prompts/sql.ts
// DEPRECATED: Legacy prompts that execute actions instead of providing guidance
// All legacy prompts have been removed as they were actually tools that executed actions.
// For new implementations, use the template prompts in templates.ts and advanced-templates.ts

import { createLogger } from '../utils/logger.js';
import { PromptDefinition } from './types.js';

const logger = createLogger('prompts:sql');

/**
 * Sets up SQL-related prompts for the MCP server
 * and returns a map with their definitions.
 *
 * NOTE: All legacy prompts have been removed as they were actually tools that executed actions.
 * Use the new template prompts in templates.ts and advanced-templates.ts instead.
 *
 * This function is kept for backward compatibility and returns an empty map.
 *
 * @returns {Map<string, PromptDefinition>} Empty map (legacy prompts removed).
 */
export const setupSqlPrompts = (): Map<string, PromptDefinition> => {
    const promptsMap = new Map<string, PromptDefinition>();
    logger.info('Legacy SQL prompts have been removed. Use template prompts instead.');
    return promptsMap;
};

// --- LEGACY CODE REMOVED --- //
// The following prompts were removed because they executed actions instead of providing guidance:
// - queryDataPrompt (use execute-query tool instead)
// - optimizeQueryPrompt (use query-optimization-guide template prompt instead)
// - generateSqlPrompt (use execute-query tool instead)
// - explainSqlPrompt (use query-optimization-guide template prompt instead)
// - sqlTutorialPrompt (use query-optimization-guide template prompt instead)
//
// For complex workflows, use the new template prompts:
// - query-optimization-guide
// - database-health-check
// - schema-design-review
