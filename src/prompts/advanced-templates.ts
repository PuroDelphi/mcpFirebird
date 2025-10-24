// src/prompts/advanced-templates.ts
// Prompts avanzados para casos de uso específicos

import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { PromptDefinition, createAssistantTextMessage } from './types.js';

const logger = createLogger('prompts:advanced-templates');

/**
 * Prompt: Migration Planning
 * Guía al LLM para planificar migraciones de base de datos
 */
const migrationPlanningPrompt: PromptDefinition = {
    name: "migration-planning",
    description: "Provides a comprehensive guide for planning database migrations, schema changes, and data transformations.",
    category: "Database Migration",
    inputSchema: z.object({
        migrationType: z.enum(['schema-change', 'data-migration', 'version-upgrade', 'platform-migration'])
            .describe("Type of migration to plan"),
        description: z.string().optional().describe("Brief description of the migration goal")
    }),
    handler: async (params: { migrationType: string; description?: string }) => {
        logger.info(`Generating migration planning prompt for: ${params.migrationType}`);

        const template = `# Database Migration Planning Guide

Migration Type: **${params.migrationType.toUpperCase().replace('-', ' ')}**
${params.description ? `\nGoal: ${params.description}` : ''}

## Phase 1: Assessment and Analysis

### 1.1 Current State Analysis
- Use \`get-database-info\` to document current database configuration
- Use \`/schema\` resource to capture complete current schema
- Use \`/statistics\` resource to understand data volumes
- Document all:
  - Tables and their relationships
  - Indexes and constraints
  - Triggers and stored procedures
  - Current performance baselines

### 1.2 Dependency Analysis
- Map all table relationships using foreign keys
- Identify dependent applications and services
- Document all database users and their permissions
- List all external integrations

### 1.3 Risk Assessment
- Identify critical tables and data
- Estimate downtime requirements
- Assess rollback complexity
- Identify potential data loss scenarios

## Phase 2: Migration Strategy

### 2.1 Approach Selection
${params.migrationType === 'schema-change' ? `
**Schema Change Strategy:**
- Determine if changes can be done online or require downtime
- Plan for backward compatibility if needed
- Consider using shadow tables for complex transformations
- Plan index rebuilding strategy
` : ''}

${params.migrationType === 'data-migration' ? `
**Data Migration Strategy:**
- Determine migration method (ETL, direct copy, etc.)
- Plan for data validation and verification
- Consider incremental vs. full migration
- Plan for data transformation logic
` : ''}

${params.migrationType === 'version-upgrade' ? `
**Version Upgrade Strategy:**
- Review Firebird version compatibility
- Test new features and deprecated functionality
- Plan for configuration changes
- Prepare for performance characteristic changes
` : ''}

${params.migrationType === 'platform-migration' ? `
**Platform Migration Strategy:**
- Map Firebird features to target platform
- Identify incompatible features
- Plan for SQL dialect differences
- Consider data type mappings
` : ''}

### 2.2 Backup Strategy
- Use \`backup-database\` to create pre-migration backup
- Verify backup integrity with \`validate-database\`
- Document backup location and retention
- Test restore procedure

### 2.3 Testing Plan
- Create test environment matching production
- Prepare test data sets
- Define success criteria
- Plan for performance testing

## Phase 3: Implementation Plan

### 3.1 Pre-Migration Steps
1. Create comprehensive backup
2. Document current state
3. Notify stakeholders
4. Prepare rollback plan
5. Set up monitoring

### 3.2 Migration Execution
1. Execute migration scripts in order
2. Monitor progress and performance
3. Validate data integrity at each step
4. Document any issues encountered
5. Verify all constraints and triggers

### 3.3 Post-Migration Steps
1. Verify data integrity
2. Rebuild statistics and indexes
3. Test application functionality
4. Monitor performance
5. Update documentation

## Phase 4: Validation and Testing

### 4.1 Data Validation
- Compare row counts before and after
- Verify data integrity using checksums
- Test foreign key relationships
- Validate business rules

### 4.2 Performance Testing
- Use \`analyze-query-performance\` on critical queries
- Compare with baseline performance
- Check for missing indexes
- Verify query plans are optimal

### 4.3 Application Testing
- Test all CRUD operations
- Verify reporting functionality
- Test edge cases and error handling
- Validate user workflows

## Phase 5: Rollback Plan

### 5.1 Rollback Triggers
Define conditions that require rollback:
- Data integrity violations
- Unacceptable performance degradation
- Critical functionality failures
- Excessive downtime

### 5.2 Rollback Procedure
1. Stop all application access
2. Use \`restore-database\` from backup
3. Verify restoration success
4. Test critical functionality
5. Resume normal operations

### 5.3 Post-Rollback Analysis
- Document what went wrong
- Analyze root causes
- Update migration plan
- Schedule retry

## Phase 6: Documentation

### 6.1 Technical Documentation
- Migration scripts and their purpose
- Schema changes made
- Data transformations applied
- Configuration changes
- Performance impacts

### 6.2 Operational Documentation
- New backup procedures
- Updated monitoring requirements
- Changed maintenance tasks
- New troubleshooting guides

## Tools and Resources to Use

**MCP Tools:**
- \`backup-database\` - Create backups
- \`restore-database\` - Restore from backup
- \`validate-database\` - Verify integrity
- \`execute-query\` - Run migration scripts
- \`analyze-query-performance\` - Test performance
- \`describe-table\` - Verify schema changes

**MCP Resources:**
- \`/schema\` - Complete schema snapshot
- \`/statistics\` - Database statistics
- \`/tables/{tableName}/indexes\` - Index information
- \`/tables/{tableName}/constraints\` - Constraint information

## Success Criteria

Define clear success criteria:
- [ ] All data migrated successfully
- [ ] Data integrity verified
- [ ] Performance meets or exceeds baseline
- [ ] All applications functioning correctly
- [ ] Backup and recovery tested
- [ ] Documentation updated
- [ ] Stakeholders notified

Use the available MCP tools to execute and validate your migration plan.`;

        return createAssistantTextMessage(template);
    }
};

/**
 * Prompt: Security Audit
 * Guía al LLM para realizar una auditoría de seguridad
 */
const securityAuditPrompt: PromptDefinition = {
    name: "security-audit",
    description: "Provides a comprehensive guide for conducting a security audit of the Firebird database.",
    category: "Security",
    inputSchema: z.object({
        auditScope: z.array(z.enum(['encryption', 'access-control', 'data-protection', 'compliance', 'all']))
            .optional()
            .describe("Specific security areas to audit (default: all)")
    }),
    handler: async (params: { auditScope?: string[] }) => {
        const scope = params.auditScope || ['all'];
        logger.info(`Generating security audit prompt for scope: ${scope.join(', ')}`);

        const template = `# Database Security Audit Guide

Audit Scope: **${scope.join(', ').toUpperCase()}**

## 1. Encryption and Data Protection ${scope.includes('encryption') || scope.includes('all') ? '✓' : '(skipped)'}

${scope.includes('encryption') || scope.includes('all') ? `
### 1.1 Wire Encryption
- Use \`verify-wire-encryption\` to check connection encryption status
- Verify WIRE_CRYPT setting is 'Enabled' or 'Required'
- Check if native driver is properly configured
- Test encrypted connections from different clients

### 1.2 Data-at-Rest Encryption
- Check if database file encryption is enabled
- Verify encryption key management
- Review backup encryption settings
- Document encryption algorithms used

### 1.3 Sensitive Data Identification
- Use \`describe-table\` to review all tables
- Identify columns containing:
  - Personal Identifiable Information (PII)
  - Financial data
  - Health information
  - Authentication credentials
  - API keys or tokens
- Verify appropriate protection measures
` : ''}

## 2. Access Control ${scope.includes('access-control') || scope.includes('all') ? '✓' : '(skipped)'}

${scope.includes('access-control') || scope.includes('all') ? `
### 2.1 User and Role Review
- List all database users
- Review role assignments
- Check for:
  - Default or weak passwords
  - Unused accounts
  - Excessive privileges
  - Shared accounts

### 2.2 Permission Analysis
- Review table-level permissions
- Check stored procedure permissions
- Verify trigger security
- Audit GRANT statements

### 2.3 Authentication
- Review authentication methods
- Check password policies
- Verify connection security
- Review failed login attempts
` : ''}

## 3. Data Protection ${scope.includes('data-protection') || scope.includes('all') ? '✓' : '(skipped)'}

${scope.includes('data-protection') || scope.includes('all') ? `
### 3.1 Backup Security
- Use \`backup-database\` to verify backup functionality
- Check backup encryption
- Review backup storage security
- Verify backup retention policies
- Test restore procedures

### 3.2 Data Integrity
- Use \`validate-database\` to check integrity
- Review constraint definitions using \`/tables/{tableName}/constraints\`
- Verify foreign key relationships
- Check for orphaned records

### 3.3 Audit Trail
- Review trigger-based audit mechanisms
- Check for data modification logging
- Verify audit log protection
- Review audit log retention
` : ''}

## 4. Compliance ${scope.includes('compliance') || scope.includes('all') ? '✓' : '(skipped)'}

${scope.includes('compliance') || scope.includes('all') ? `
### 4.1 Regulatory Requirements
Check compliance with applicable regulations:
- GDPR (data privacy, right to deletion)
- HIPAA (health information protection)
- PCI DSS (payment card data)
- SOX (financial data integrity)
- Industry-specific regulations

### 4.2 Data Retention
- Review data retention policies
- Check for automated data purging
- Verify archival procedures
- Document retention periods

### 4.3 Privacy Controls
- Verify data minimization practices
- Check for data anonymization
- Review consent management
- Verify right-to-deletion implementation
` : ''}

## 5. Vulnerability Assessment

### 5.1 SQL Injection Prevention
- Review all dynamic SQL usage
- Check for parameterized queries
- Verify input validation
- Test for SQL injection vulnerabilities

### 5.2 Configuration Security
- Review Firebird server configuration
- Check for exposed management ports
- Verify firewall rules
- Review network segmentation

### 5.3 Patch Management
- Check Firebird version
- Review security patches applied
- Verify update procedures
- Document patch history

## 6. Monitoring and Alerting

### 6.1 Security Monitoring
- Review security event logging
- Check for intrusion detection
- Verify alert mechanisms
- Test incident response procedures

### 6.2 Performance Monitoring
- Use \`analyze-query-performance\` to detect anomalies
- Monitor for unusual query patterns
- Check for resource exhaustion attacks
- Review connection limits

## 7. Security Findings Report

### 7.1 Critical Issues
Document issues requiring immediate attention:
- Unencrypted sensitive data
- Weak authentication
- Missing access controls
- Known vulnerabilities

### 7.2 High Priority Issues
Document important security improvements:
- Missing encryption
- Inadequate monitoring
- Weak password policies
- Insufficient backup security

### 7.3 Recommendations
Provide specific, actionable recommendations:
- Enable wire encryption
- Implement role-based access control
- Enhance audit logging
- Improve backup security
- Update to latest secure version

### 7.4 Compliance Status
- List compliance requirements met
- Document gaps in compliance
- Provide remediation timeline
- Assign responsibility for fixes

## Tools to Use

**MCP Tools:**
- \`verify-wire-encryption\` - Check encryption status
- \`get-database-info\` - Database configuration
- \`validate-database\` - Data integrity
- \`backup-database\` - Backup functionality
- \`describe-table\` - Schema review

**MCP Resources:**
- \`/schema\` - Complete schema
- \`/tables/{tableName}/constraints\` - Constraints
- \`/tables/{tableName}/triggers\` - Triggers
- \`/statistics\` - Database statistics

Conduct a thorough security audit using the available MCP tools and document all findings.`;

        return createAssistantTextMessage(template);
    }
};

/**
 * Exportar todos los prompts avanzados
 */
export const setupAdvancedTemplatePrompts = (): Map<string, PromptDefinition> => {
    const prompts = new Map<string, PromptDefinition>();

    prompts.set(migrationPlanningPrompt.name, migrationPlanningPrompt);
    prompts.set(securityAuditPrompt.name, securityAuditPrompt);

    logger.info(`Defined ${prompts.size} advanced template prompts`);
    return prompts;
};

