// src/prompts/database.ts
// DEPRECATED: Legacy prompts that execute actions instead of providing guidance
// All legacy prompts have been removed as they were actually tools that executed actions.
// For new implementations, use the template prompts in templates.ts and advanced-templates.ts

import { createLogger } from '../utils/logger.js';
import { PromptDefinition } from './types.js';

const logger = createLogger('prompts:database');

/**
 * Sets up prompts related to database structure
 * and returns a map with their definitions.
 *
 * NOTE: All legacy prompts have been removed as they were actually tools that executed actions.
 * Use the new template prompts in templates.ts and advanced-templates.ts instead.
 *
 * This function is kept for backward compatibility and returns an empty map.
 *
 * @returns {Map<string, PromptDefinition>} Empty map (legacy prompts removed).
 */
export const setupDatabasePrompts = (): Map<string, PromptDefinition> => {
    const promptsMap = new Map<string, PromptDefinition>();
    logger.info('Legacy database prompts have been removed. Use template prompts instead.');
    return promptsMap;
};

// --- LEGACY CODE REMOVED --- //
// The following prompts were removed because they executed actions instead of providing guidance:
// - analyzeTablePrompt (use describe-table tool instead)
// - listTablesPrompt (use list-tables tool instead)
// - analyzeTableRelationshipsPrompt (use describe-table + schema resources instead)
// - databaseSchemaOverviewPrompt (use /schema resource instead)
// - analyzeTableDataPrompt (use analyze-table-statistics tool instead)
//
// For complex workflows, use the new template prompts:
// - database-health-check
// - schema-design-review
// - migration-planning
// - security-audit
