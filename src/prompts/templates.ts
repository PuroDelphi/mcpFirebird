// src/prompts/templates.ts
// Prompts REALES según la especificación MCP
// Estos son templates que guían al LLM, NO ejecutan acciones

import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { PromptDefinition, createAssistantTextMessage } from './types.js';

const logger = createLogger('prompts:templates');

/**
 * Prompt: Database Health Check
 * Guía al LLM para realizar un análisis completo de salud de la base de datos
 */
const databaseHealthCheckPrompt: PromptDefinition = {
    name: "database-health-check",
    description: "Provides a comprehensive guide for analyzing database health, including performance, integrity, and security checks.",
    category: "Database Analysis",
    inputSchema: z.object({
        focusAreas: z.array(z.enum(['performance', 'integrity', 'security', 'structure', 'all']))
            .optional()
            .describe("Specific areas to focus on (default: all)")
    }),
    handler: async (params: { focusAreas?: string[] }) => {
        const areas = params.focusAreas || ['all'];
        logger.info(`Generating database health check prompt for areas: ${areas.join(', ')}`);

        const template = `# Database Health Check Guide

You are tasked with performing a comprehensive health check of the Firebird database. Follow these steps:

## 1. Database Overview
- Use \`get-database-info\` to get general database information
- Use \`list-tables\` to see all tables
- Use \`/statistics\` resource to get database statistics

## 2. Structure Analysis ${areas.includes('structure') || areas.includes('all') ? '✓' : '(skipped)'}
${areas.includes('structure') || areas.includes('all') ? `
- Review table schemas using \`describe-table\` for key tables
- Check for missing indexes using \`/tables/{tableName}/indexes\` resource
- Verify constraints using \`/tables/{tableName}/constraints\` resource
- Review triggers using \`/tables/{tableName}/triggers\` resource
` : ''}

## 3. Performance Analysis ${areas.includes('performance') || areas.includes('all') ? '✓' : '(skipped)'}
${areas.includes('performance') || areas.includes('all') ? `
- Use \`analyze-query-performance\` on critical queries
- Use \`get-execution-plan\` to understand query execution
- Use \`analyze-missing-indexes\` to identify optimization opportunities
- Check table statistics using \`analyze-table-statistics\`
` : ''}

## 4. Data Integrity ${areas.includes('integrity') || areas.includes('all') ? '✓' : '(skipped)'}
${areas.includes('integrity') || areas.includes('all') ? `
- Use \`validate-database\` to check database integrity
- Verify foreign key relationships are properly defined
- Check for orphaned records
- Verify data consistency across related tables
` : ''}

## 5. Security Analysis ${areas.includes('security') || areas.includes('all') ? '✓' : '(skipped)'}
${areas.includes('security') || areas.includes('all') ? `
- Use \`verify-wire-encryption\` to check encryption status
- Review table permissions and access controls
- Check for sensitive data exposure
- Verify backup procedures are in place
` : ''}

## 6. Recommendations
Based on your findings, provide:
- Critical issues that need immediate attention
- Performance optimization suggestions
- Security improvements
- Best practices recommendations

Use the available MCP tools and resources to gather all necessary information.`;

        return createAssistantTextMessage(template);
    }
};

/**
 * Prompt: Query Optimization Guide
 * Guía al LLM para optimizar consultas SQL
 */
const queryOptimizationGuidePrompt: PromptDefinition = {
    name: "query-optimization-guide",
    description: "Provides a step-by-step guide for optimizing SQL queries in Firebird.",
    category: "SQL Optimization",
    inputSchema: z.object({
        queryType: z.enum(['select', 'insert', 'update', 'delete', 'general'])
            .optional()
            .describe("Type of query to optimize (default: general)")
    }),
    handler: async (params: { queryType?: string }) => {
        const type = params.queryType || 'general';
        logger.info(`Generating query optimization guide for type: ${type}`);

        const template = `# Query Optimization Guide for Firebird

You are tasked with optimizing ${type === 'general' ? 'SQL queries' : type.toUpperCase() + ' queries'} in Firebird. Follow this systematic approach:

## 1. Analyze Current Performance
- Use \`analyze-query-performance\` to measure current execution time
- Use \`get-execution-plan\` to understand how Firebird executes the query
- Identify bottlenecks (table scans, missing indexes, etc.)

## 2. Review Table Structure
- Use \`describe-table\` to understand table schemas
- Check existing indexes using \`/tables/{tableName}/indexes\` resource
- Review constraints using \`/tables/{tableName}/constraints\` resource

## 3. Identify Optimization Opportunities
- Use \`analyze-missing-indexes\` to find missing indexes
- Look for:
  - Full table scans that could use indexes
  - Inefficient JOIN operations
  - Unnecessary columns in SELECT
  - Missing WHERE clause optimizations
  - Suboptimal ORDER BY usage

## 4. Firebird-Specific Optimizations
${type === 'select' || type === 'general' ? `
### SELECT Optimization:
- Use FIRST/SKIP instead of LIMIT/OFFSET
- Avoid SELECT * - specify only needed columns
- Use appropriate JOIN types (INNER, LEFT, etc.)
- Consider using PLAN clause for complex queries
- Use indexes on WHERE, JOIN, and ORDER BY columns
` : ''}

${type === 'insert' || type === 'general' ? `
### INSERT Optimization:
- Use batch inserts when possible
- Disable triggers temporarily for bulk operations
- Consider using EXECUTE BLOCK for multiple inserts
- Deactivate indexes before bulk inserts, reactivate after
` : ''}

${type === 'update' || type === 'general' ? `
### UPDATE Optimization:
- Use WHERE clause to limit affected rows
- Update only necessary columns
- Consider using EXECUTE BLOCK for complex updates
- Be aware of trigger overhead
` : ''}

${type === 'delete' || type === 'general' ? `
### DELETE Optimization:
- Use WHERE clause carefully
- Consider CASCADE effects on foreign keys
- For large deletes, use batching
- Be aware of trigger overhead
` : ''}

## 5. Test and Validate
- Re-run \`analyze-query-performance\` after changes
- Compare execution plans before and after
- Verify results are correct
- Test with production-like data volumes

## 6. Document Changes
- Document the optimization applied
- Record performance improvements
- Note any trade-offs or considerations

Use the available MCP tools to implement and test your optimizations.`;

        return createAssistantTextMessage(template);
    }
};

/**
 * Prompt: Schema Design Review
 * Guía al LLM para revisar el diseño del esquema de base de datos
 */
const schemaDesignReviewPrompt: PromptDefinition = {
    name: "schema-design-review",
    description: "Provides a comprehensive guide for reviewing database schema design and suggesting improvements.",
    category: "Database Design",
    inputSchema: z.object({
        tableName: z.string().optional().describe("Specific table to review (if not provided, reviews entire schema)")
    }),
    handler: async (params: { tableName?: string }) => {
        const scope = params.tableName ? `table '${params.tableName}'` : 'entire database schema';
        logger.info(`Generating schema design review prompt for: ${scope}`);

        const template = `# Schema Design Review Guide

You are tasked with reviewing the ${scope} and providing design recommendations.

## 1. Gather Schema Information
${params.tableName ? `
- Use \`describe-table\` for '${params.tableName}'
- Use \`/tables/${params.tableName}/indexes\` resource
- Use \`/tables/${params.tableName}/constraints\` resource
- Use \`/tables/${params.tableName}/triggers\` resource
` : `
- Use \`list-tables\` to get all tables
- Use \`/schema\` resource to get complete database schema
- Use \`describe-batch-tables\` for multiple tables
`}

## 2. Normalization Analysis
- Check for proper normalization (1NF, 2NF, 3NF)
- Identify potential denormalization opportunities for performance
- Look for:
  - Repeating groups
  - Partial dependencies
  - Transitive dependencies
  - Redundant data

## 3. Data Types Review
- Verify appropriate data types for each column
- Check for:
  - VARCHAR vs CHAR usage
  - INTEGER vs BIGINT for IDs
  - DECIMAL precision for monetary values
  - DATE vs TIMESTAMP usage
  - BLOB usage and alternatives

## 4. Constraints and Integrity
- Review PRIMARY KEY definitions
- Check FOREIGN KEY relationships
- Verify UNIQUE constraints
- Review CHECK constraints
- Validate NOT NULL constraints
- Check DEFAULT values

## 5. Indexing Strategy
- Review existing indexes
- Identify missing indexes for:
  - Foreign keys
  - Frequently queried columns
  - JOIN columns
  - WHERE clause columns
  - ORDER BY columns
- Identify redundant or unused indexes

## 6. Naming Conventions
- Check consistency in naming:
  - Table names
  - Column names
  - Constraint names
  - Index names
  - Trigger names

## 7. Performance Considerations
- Table size and growth projections
- Query patterns and access frequency
- Partitioning opportunities
- Archive strategy for historical data

## 8. Security and Access
- Sensitive data identification
- Encryption requirements
- Access control needs
- Audit trail requirements

## 9. Recommendations
Provide specific, actionable recommendations:
- Critical issues (data integrity, security)
- Performance improvements
- Maintainability enhancements
- Best practices alignment
- Migration path if major changes needed

Use the available MCP tools and resources to gather comprehensive information.`;

        return createAssistantTextMessage(template);
    }
};

/**
 * Exportar todos los prompts de templates
 */
export const setupTemplatePrompts = (): Map<string, PromptDefinition> => {
    const prompts = new Map<string, PromptDefinition>();

    prompts.set(databaseHealthCheckPrompt.name, databaseHealthCheckPrompt);
    prompts.set(queryOptimizationGuidePrompt.name, queryOptimizationGuidePrompt);
    prompts.set(schemaDesignReviewPrompt.name, schemaDesignReviewPrompt);

    logger.info(`Defined ${prompts.size} template prompts`);
    return prompts;
};

