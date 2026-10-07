// Deliberately mock only the driver boundary: production SQL, metadata mapping,
// policy checks, handlers, serialization and MCP schema validation remain real.
import { DriverFactory } from '../../dist/db/driver-factory.js';

export const cases = [
    ['execute-query', { sql: 'SELECT * FROM CUSTOMERS' }],
    ['list-tables', {}], ['get-database-info', {}],
    ['describe-table', { tableName: 'CUSTOMERS' }],
    ['get-field-descriptions', { tableName: 'CUSTOMERS' }],
    ['get-table-indexes', { tableName: 'CUSTOMERS' }],
    ['get-table-constraints', { tableName: 'CUSTOMERS' }],
    ['get-table-triggers', { tableName: 'CUSTOMERS' }],
    ['analyze-query-performance', { sql: 'SELECT * FROM CUSTOMERS', iterations: 1 }],
    ['get-execution-plan', { sql: 'SELECT * FROM CUSTOMERS' }],
    ['analyze-missing-indexes', { sql: 'SELECT * FROM CUSTOMERS' }],
    ['execute-batch-queries', { queries: [{ sql: 'SELECT * FROM CUSTOMERS' }] }],
    ['describe-batch-tables', { tableNames: ['CUSTOMERS'] }],
    ['get-table-data', { tableName: 'CUSTOMERS', first: 10, skip: 0 }],
    ['analyze-table-statistics', { tableName: 'CUSTOMERS' }],
    ['verify-wire-encryption', {}], ['get-server-info', {}],
    ['list-available-tools', {}], ['get-tool-help', { toolName: 'list-tables' }],
    ['system-health-check', {}], ['list-available-events', {}],
    ['list-triggers', {}], ['describe-trigger', { triggerName: 'TR_CUSTOMERS' }],
    ['list-procedures', {}], ['describe-procedure', { procedureName: 'P_CUSTOMERS' }],
    ['list-functions', {}], ['describe-function', { functionName: 'F_CUSTOMERS' }],
    ['list-packages', {}], ['describe-package', { packageName: 'PKG_CUSTOMERS' }],
    ['echo', { message: 'contract regression' }]
];

function rowsFor(sql) {
    const text = sql.replace(/\s+/g, ' ').toUpperCase();
    if (text.includes('POST_EVENT')) return [{ NAME: 'TR_CUSTOMERS', TYPE: 'TRIGGER' }];
    if (text.includes('FROM RDB$RELATIONS')) return [{ RDB$RELATION_NAME: 'CUSTOMERS   ' }, { RDB$RELATION_NAME: 'ORDERS   ' }];
    if (text.includes('FROM RDB$RELATION_FIELDS')) return [
        { FIELD_NAME: 'ID', FIELD_TYPE: 'INTEGER', FIELD_LENGTH: 4, FIELD_SCALE: 0, NULLABLE: 0, DEFAULT_VALUE: null, PRIMARY_KEY: 1, DESCRIPTION: null },
        { FIELD_NAME: 'NAME', FIELD_TYPE: 'VARCHAR', FIELD_LENGTH: 100, FIELD_SCALE: null, NULLABLE: 1, DEFAULT_VALUE: Buffer.from("DEFAULT 'guest'"), PRIMARY_KEY: 0, DESCRIPTION: 'Display name' }
    ];
    if (text.includes('FROM RDB$INDICES')) return [{ INDEX_NAME: 'IX_CUSTOMERS ', IS_UNIQUE: 1, INDEX_TYPE: 0, SEGMENT_COUNT: 1, FIELD_NAME: 'ID ' }];
    if (text.includes('FROM RDB$RELATION_CONSTRAINTS')) return [{ CONSTRAINT_NAME: 'PK_CUSTOMERS ', CONSTRAINT_TYPE: 'PRIMARY KEY ', INDEX_NAME: 'IX_CUSTOMERS ', FIELD_NAME: 'ID ', REFERENCED_TABLE_NAME: null, CHECK_SOURCE: null }];
    if (text.includes('FROM RDB$TRIGGERS')) return [{ NAME: 'TR_CUSTOMERS', TABLE_NAME: 'CUSTOMERS', TRIGGER_NAME: 'TR_CUSTOMERS ', TRIGGER_TYPE: 1, SEQUENCE: 0, TRIGGER_SEQUENCE: 0, INACTIVE: 0, IS_INACTIVE: 0, SOURCE: Buffer.from('AS BEGIN END'), DESCRIPTION: null }];
    if (text.includes('FROM RDB$PROCEDURES')) return [{ NAME: 'P_CUSTOMERS', INPUT_PARAMS: 0, OUTPUT_PARAMS: 1, SOURCE: 'AS BEGIN SUSPEND; END', DESCRIPTION: null, VALID_BLR: 1 }];
    if (text.includes('FROM RDB$FUNCTIONS')) return [{ NAME: 'F_CUSTOMERS', MODULE_NAME: null, ENTRY_POINT: null, RETURN_ARGUMENT: 0, SOURCE: 'BEGIN RETURN 1; END', DESCRIPTION: null, VALID_BLR: 1 }];
    if (text.includes('FROM RDB$PACKAGES')) return [{ NAME: 'PKG_CUSTOMERS', HEADER_SOURCE: 'BEGIN END', BODY_SOURCE: 'BEGIN END', DESCRIPTION: null, VALID_BODY_FLAG: 1 }];
    if (text.includes('COUNT(*)')) return [{ ROW_COUNT: 2 }];
    if (text.includes('FROM CUSTOMERS') || text.includes('FROM "CUSTOMERS"')) return [
        { ID: 1, NAME: 'Alice', CREATED: new Date('2026-09-30T00:00:00Z'), ACTIVE: true, OPTIONAL: null, NOTE: Buffer.from('text blob'), EXTRA: { values: [1, false, null, { nested: 'yes' }] } },
        { ID: 2, NAME: 'Bob', CREATED: null, ACTIVE: false, OPTIONAL: null, NOTE: null, EXTRA: [] }
    ];
    throw new Error(`Unexpected SQL in contract fixture: ${text}`);
}

export function installContractDriver() {
    globalThis.MCP_FIREBIRD_CONFIG = { host: '127.0.0.1', port: 3050, database: 'mock-contract-only', user: 'test', password: 'test' };
    DriverFactory.getDriverInfo = async () => ({ current: 'pure-js', nativeAvailable: false });
    DriverFactory.getDriver = async () => ({ attach: async () => ({
        query: (sql, params, callback) => {
            try { callback(null, rowsFor(sql)); } catch (error) { callback(error); }
        },
        detach: callback => callback(null)
    }) });
}
