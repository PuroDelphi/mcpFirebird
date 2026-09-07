import { checkAllowedOperation, checkAllowedTable } from '../security/authorization.js';
import { executeQuery } from './queries.js';

const trimmed = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value.trim();
    if (Buffer.isBuffer(value)) return value.toString('utf8').trim();
    return undefined;
};

export async function getTableIndexes(tableName: string) {
    checkAllowedOperation('SELECT');
    checkAllowedTable(tableName);

    const rows = await executeQuery(`
        SELECT
            I.RDB$INDEX_NAME AS INDEX_NAME,
            I.RDB$UNIQUE_FLAG AS IS_UNIQUE,
            I.RDB$INDEX_TYPE AS INDEX_TYPE,
            I.RDB$SEGMENT_COUNT AS SEGMENT_COUNT,
            S.RDB$FIELD_NAME AS FIELD_NAME,
            S.RDB$FIELD_POSITION AS FIELD_POSITION
        FROM RDB$INDICES I
        LEFT JOIN RDB$INDEX_SEGMENTS S ON I.RDB$INDEX_NAME = S.RDB$INDEX_NAME
        WHERE I.RDB$RELATION_NAME = ?
          AND COALESCE(I.RDB$SYSTEM_FLAG, 0) = 0
        ORDER BY I.RDB$INDEX_NAME, S.RDB$FIELD_POSITION
    `, [tableName.toUpperCase()]);

    const indexes = new Map<string, any>();
    for (const row of rows) {
        const name = trimmed(row.INDEX_NAME);
        if (!name) continue;
        if (!indexes.has(name)) {
            indexes.set(name, {
                name,
                isUnique: row.IS_UNIQUE === 1,
                type: row.INDEX_TYPE === 1 ? 'DESCENDING' : 'ASCENDING',
                segmentCount: row.SEGMENT_COUNT || 0,
                columns: [] as string[]
            });
        }
        const fieldName = trimmed(row.FIELD_NAME);
        if (fieldName) indexes.get(name).columns.push(fieldName);
    }

    return { tableName, indexes: Array.from(indexes.values()) };
}

export async function getTableConstraints(tableName: string) {
    checkAllowedOperation('SELECT');
    checkAllowedTable(tableName);

    const rows = await executeQuery(`
        SELECT
            RC.RDB$CONSTRAINT_NAME AS CONSTRAINT_NAME,
            RC.RDB$CONSTRAINT_TYPE AS CONSTRAINT_TYPE,
            RC.RDB$INDEX_NAME AS INDEX_NAME,
            S.RDB$FIELD_NAME AS FIELD_NAME,
            S.RDB$FIELD_POSITION AS FIELD_POSITION,
            RRC.RDB$RELATION_NAME AS REFERENCED_TABLE_NAME,
            RS.RDB$FIELD_NAME AS REFERENCED_FIELD_NAME,
            T.RDB$TRIGGER_SOURCE AS CHECK_SOURCE
        FROM RDB$RELATION_CONSTRAINTS RC
        LEFT JOIN RDB$INDEX_SEGMENTS S ON RC.RDB$INDEX_NAME = S.RDB$INDEX_NAME
        LEFT JOIN RDB$REF_CONSTRAINTS RFC ON RC.RDB$CONSTRAINT_NAME = RFC.RDB$CONSTRAINT_NAME
        LEFT JOIN RDB$RELATION_CONSTRAINTS RRC ON RFC.RDB$CONST_NAME_UQ = RRC.RDB$CONSTRAINT_NAME
        LEFT JOIN RDB$INDEX_SEGMENTS RS
          ON RRC.RDB$INDEX_NAME = RS.RDB$INDEX_NAME
         AND S.RDB$FIELD_POSITION = RS.RDB$FIELD_POSITION
        LEFT JOIN RDB$CHECK_CONSTRAINTS CC ON RC.RDB$CONSTRAINT_NAME = CC.RDB$CONSTRAINT_NAME
        LEFT JOIN RDB$TRIGGERS T ON CC.RDB$TRIGGER_NAME = T.RDB$TRIGGER_NAME
        WHERE RC.RDB$RELATION_NAME = ?
        ORDER BY RC.RDB$CONSTRAINT_NAME, S.RDB$FIELD_POSITION
    `, [tableName.toUpperCase()]);

    const constraints = new Map<string, any>();
    for (const row of rows) {
        const name = trimmed(row.CONSTRAINT_NAME);
        if (!name) continue;
        if (!constraints.has(name)) {
            constraints.set(name, {
                name,
                type: trimmed(row.CONSTRAINT_TYPE),
                indexName: trimmed(row.INDEX_NAME),
                columns: [] as string[]
            });
        }
        const constraint = constraints.get(name);
        const fieldName = trimmed(row.FIELD_NAME);
        if (fieldName && !constraint.columns.includes(fieldName)) constraint.columns.push(fieldName);

        const referencedTable = trimmed(row.REFERENCED_TABLE_NAME);
        const referencedField = trimmed(row.REFERENCED_FIELD_NAME);
        if (referencedTable) {
            constraint.references ||= { table: referencedTable, columns: [] as string[] };
            if (referencedField && !constraint.references.columns.includes(referencedField)) {
                constraint.references.columns.push(referencedField);
            }
        }

        const checkSource = trimmed(row.CHECK_SOURCE);
        if (checkSource) constraint.checkSource = checkSource;
    }

    return { tableName, constraints: Array.from(constraints.values()) };
}

export async function getTableTriggers(tableName: string) {
    checkAllowedOperation('SELECT');
    checkAllowedTable(tableName);

    const rows = await executeQuery(`
        SELECT
            RDB$TRIGGER_NAME AS TRIGGER_NAME,
            RDB$TRIGGER_TYPE AS TRIGGER_TYPE,
            RDB$TRIGGER_SEQUENCE AS TRIGGER_SEQUENCE,
            RDB$TRIGGER_INACTIVE AS IS_INACTIVE,
            RDB$TRIGGER_SOURCE AS SOURCE,
            RDB$DESCRIPTION AS DESCRIPTION
        FROM RDB$TRIGGERS
        WHERE RDB$RELATION_NAME = ?
          AND COALESCE(RDB$SYSTEM_FLAG, 0) = 0
        ORDER BY RDB$TRIGGER_NAME
    `, [tableName.toUpperCase()]);

    return {
        tableName,
        triggers: rows.map(row => ({
            name: trimmed(row.TRIGGER_NAME),
            type: row.TRIGGER_TYPE,
            sequence: row.TRIGGER_SEQUENCE,
            isActive: row.IS_INACTIVE === 0,
            source: trimmed(row.SOURCE) || '',
            description: trimmed(row.DESCRIPTION)
        }))
    };
}
