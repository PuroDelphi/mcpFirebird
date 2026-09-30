import { z } from 'zod';

// SQL column names and values depend on the user's database and driver. Do not
// invent fixed columns or coerce their values in the advertised contract.
const Row = z.record(z.string(), z.unknown());
const Rows = z.array(Row);
const Table = z.object({ name: z.string(), uri: z.string() });
const Tables = z.array(Table);
const Column = z.object({
    field_name: z.string(), field_type: z.string(),
    field_length: z.number().nullable().optional(), field_scale: z.number().optional(),
    nullable: z.boolean(), default_value: z.unknown().optional(),
    primary_key: z.boolean(), description: z.unknown().optional()
});
const Columns = z.array(Column);
const ToolSummary = z.object({
    name: z.string(), title: z.string(), description: z.string(),
    category: z.enum(['database', 'metadata'])
});
const Trigger = z.object({
    name: z.string(), tableName: z.string(), triggerType: z.string(),
    sequence: z.number(), inactive: z.boolean(),
    source: z.unknown(), description: z.unknown().optional()
});
const Procedure = z.object({
    name: z.string(), inputParams: z.number(), outputParams: z.number(),
    source: z.unknown(), description: z.unknown().optional(), validBlr: z.boolean()
});
const FunctionInfo = z.object({
    name: z.string(), moduleName: z.string().nullable().optional(),
    entryPoint: z.string().nullable().optional(), returnArgument: z.number(),
    source: z.unknown().optional(), description: z.unknown().optional(), validBlr: z.boolean()
});
const Package = z.object({
    name: z.string(), headerSource: z.unknown(), bodySource: z.unknown().optional(),
    description: z.unknown().optional(), validBodyFlag: z.boolean()
});

// Only these handlers execute SQL supplied by the caller. Plan retrieval and
// index suggestions currently inspect SQL without executing it.
export const userSqlTools: ReadonlySet<string> = new Set([
    'execute-query', 'execute-batch-queries', 'analyze-query-performance'
]);

export const databaseResultSchemas: Record<string, z.ZodType> = {
    'execute-query': z.object({ rows: Rows }),
    'list-tables': z.object({ tables: Tables }),
    'describe-table': z.object({ schema: Columns }),
    'get-field-descriptions': z.object({
        fieldDescriptions: z.array(z.object({ name: z.string(), description: z.unknown() }))
    }),
    'get-table-indexes': z.object({
        tableName: z.string(),
        indexes: z.array(z.object({
            name: z.string(), isUnique: z.boolean(), type: z.enum(['ASCENDING', 'DESCENDING']),
            segmentCount: z.number(), columns: z.array(z.string())
        }))
    }),
    'get-table-constraints': z.object({
        tableName: z.string(),
        constraints: z.array(z.object({
            name: z.string(), type: z.string().optional(), indexName: z.string().optional(),
            columns: z.array(z.string()), checkSource: z.string().optional(),
            references: z.object({ table: z.string(), columns: z.array(z.string()) }).optional()
        }))
    }),
    'get-table-triggers': z.object({
        tableName: z.string(),
        triggers: z.array(z.object({
            name: z.string().optional(), type: z.number().nullable().optional(),
            sequence: z.number().nullable().optional(), isActive: z.boolean(),
            source: z.string(), description: z.string().optional()
        }))
    }),
    'analyze-query-performance': z.object({
        query: z.string(), executionTimes: z.array(z.number()), averageTime: z.number(),
        minTime: z.number(), maxTime: z.number(), rowCount: z.number(),
        success: z.boolean(), error: z.string().optional(), analysis: z.string()
    }),
    'get-execution-plan': z.object({
        query: z.string(), plan: z.string(), planDetails: z.array(z.unknown()),
        success: z.boolean(), error: z.string().optional(), analysis: z.string()
    }),
    'analyze-missing-indexes': z.object({
        missingIndexes: z.array(z.string()), recommendations: z.array(z.string()),
        success: z.boolean(), error: z.string().optional()
    }),
    'execute-batch-queries': z.object({
        results: z.array(z.object({
            success: z.boolean(), data: Rows.optional(),
            error: z.string().optional(), errorType: z.string().optional()
        }))
    }),
    'describe-batch-tables': z.array(z.object({
        tableName: z.string(), schema: Columns.nullable(),
        error: z.string().optional(), errorType: z.string().optional()
    })),
    'get-table-data': z.object({ tableName: z.string(), rowCount: z.number(), data: Rows }),
    'analyze-table-statistics': z.object({
        tableName: z.string(), rowCount: z.union([z.number(), z.string()]),
        columnCount: z.number(), sampleSize: z.number(),
        columns: z.array(z.object({
            name: z.string().optional(), type: z.string().optional(),
            nullable: z.boolean(), hasDefault: z.boolean()
        }))
    }),
    'verify-wire-encryption': z.object({
        verified: z.literal(false), status: z.literal('configuration-only'),
        hasNativeDriver: z.boolean(), wireEncryptionEnabled: z.boolean(),
        driverType: z.enum(['native', 'pure-js']), recommendation: z.string()
    }),
    'get-database-info': z.object({ totalTables: z.number(), tables: Tables })
};

export const metadataResultSchemas: Record<string, z.ZodType> = {
    'get-server-info': z.object({
        name: z.string(), version: z.string(), description: z.string(),
        capabilities: z.object({ tools: z.array(z.string()), totalTools: z.number(), features: z.array(z.string()) }),
        runtime: z.object({
            nodeVersion: z.string(), platform: z.string(), uptime: z.number(),
            memoryUsage: z.record(z.string(), z.number())
        })
    }),
    'list-available-tools': z.array(ToolSummary),
    'get-tool-help': ToolSummary.extend({ inputSchema: z.string(), usage: z.string() }),
    'system-health-check': z.object({
        status: z.literal('healthy'), timestamp: z.string(), uptime: z.number(),
        memory: z.object({ used: z.number(), total: z.number(), external: z.number() }),
        environment: z.object({ nodeVersion: z.string(), platform: z.string(), arch: z.string() }),
        tools: z.object({ database: z.number(), metadata: z.number(), total: z.number() })
    }),
    'list-available-events': z.array(z.object({ name: z.string(), type: z.string() })),
    'list-triggers': z.object({ totalTriggers: z.number(), triggers: z.array(Trigger) }),
    'describe-trigger': Trigger,
    'list-procedures': z.object({ totalProcedures: z.number(), procedures: z.array(Procedure) }),
    'describe-procedure': Procedure,
    'list-functions': z.object({ totalFunctions: z.number(), functions: z.array(FunctionInfo) }),
    'describe-function': FunctionInfo,
    'list-packages': z.object({ totalPackages: z.number(), packages: z.array(Package) }),
    'describe-package': Package
};
