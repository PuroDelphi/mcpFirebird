import { adviseIndexes } from '../../db/index-advisor.js';
import { DEFAULT_SECURITY_CONFIG, securityConfig } from '../../security/config.js';

const index = (name: string, columns: string[], flags = {}) => columns.map((FIELD_NAME, FIELD_POSITION) => ({
    INDEX_NAME: name + ' ', FIELD_NAME: FIELD_NAME + ' ', FIELD_POSITION, INDEX_TYPE: 0, IS_INACTIVE: 0, IS_EXPRESSION: 0, IS_PARTIAL: 0, ...flags
}));
function reader(indexes: any[] = [], options: { fields?: string[]; partial?: boolean; view?: boolean } = {}) {
    return jest.fn(async (sql: string, params: any[]) => {
        if (params[0] === 'RDB$INDICES') return options.partial ? [{ FIELD_NAME: 'RDB$CONDITION_BLR' }] : [];
        if (sql.includes('FROM RDB$INDICES')) return indexes;
        return (options.fields || ['ID', 'A', 'B', 'NAME']).map(FIELD_NAME => ({ FIELD_NAME: FIELD_NAME + ' ', IS_INDEXABLE: 1, IS_VIEW: options.view ? 1 : 0 }));
    });
}

describe('catalog-aware conservative index advisor', () => {
    beforeEach(() => {
        for (const key of Object.keys(securityConfig)) delete (securityConfig as any)[key];
        Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG));
    });

    it('does not duplicate a system-generated primary-key index', async () => {
        const read = reader(index('RDB$PRIMARY1', ['ID']));
        const result = await adviseIndexes('SELECT * FROM T WHERE ID = ? ORDER BY ID', read);
        expect(result.missingIndexes).toEqual([]);
        expect(read.mock.calls[2][0]).not.toMatch(/SYSTEM_FLAG/);
        expect(read.mock.calls[2][1]).toEqual(['T']);
    });

    it('recognizes a composite left prefix but not non-leading segments', async () => {
        const read = reader(index('IX_AB', ['A', 'B']));
        expect((await adviseIndexes('SELECT * FROM T WHERE A = 1 ORDER BY A, B', read)).missingIndexes).toEqual([]);
        expect((await adviseIndexes('SELECT * FROM T WHERE B = 1', read)).missingIndexes).toHaveLength(1);
    });

    it('recommends reviewing inactive coverage, not creating a duplicate or activating it', async () => {
        const result = await adviseIndexes('SELECT * FROM T WHERE ID = 1', reader(index('IX_ID', ['ID'], { IS_INACTIVE: 1 })));
        expect(result.missingIndexes).toEqual([]); expect(result.recommendations.join(' ')).toMatch(/inactive.*IX_ID.*No activation/);
    });

    it.each([{ IS_PARTIAL: 1 }, { IS_EXPRESSION: 1 }])('does not mistake conditional/expression indexes for general coverage: %p', async flags => {
        const result = await adviseIndexes('SELECT * FROM T WHERE A = 1', reader(index('IX_A', ['A'], flags), { partial: true }));
        expect(result.missingIndexes).toHaveLength(1);
    });

    it('probes partial-index catalog support before selecting its newer column', async () => {
        const old = reader(), modern = reader([], { partial: true });
        await adviseIndexes('SELECT * FROM T WHERE A = 1', old);
        await adviseIndexes('SELECT * FROM T WHERE A = 1', modern);
        expect(old.mock.calls[1][1]).toEqual(['RDB$INDICES', 'RDB$CONDITION_BLR']);
        expect(old.mock.calls[2][0]).not.toContain('I.RDB$CONDITION_BLR');
        expect(modern.mock.calls[2][0]).toContain('I.RDB$CONDITION_BLR');
    });

    it('uses index direction for ordering but either direction for predicates', async () => {
        const read = reader(index('IX_A_DESC', ['A'], { INDEX_TYPE: 1 }));
        expect((await adviseIndexes('SELECT * FROM T WHERE A = 1 ORDER BY A DESC', read)).missingIndexes).toEqual([]);
        expect((await adviseIndexes('SELECT * FROM T ORDER BY A ASC', read)).missingIndexes).toHaveLength(1);
        expect((await adviseIndexes('SELECT * FROM T ORDER BY B DESC', read)).missingIndexes[0]).toMatch(/^CREATE DESCENDING INDEX/);
    });

    it('deduplicates repeated predicates and composite order prefixes', async () => {
        const result = await adviseIndexes('SELECT * FROM T WHERE A = ? OR A > ? ORDER BY A, B', reader());
        expect(result.missingIndexes).toHaveLength(1); expect(result.missingIndexes[0]).toContain('("A", "B")');
    });

    it('resolves aliases, case-sensitive quoted identifiers and embedded quotes without SQL interpolation', async () => {
        const read = reader([], { fields: ['odd"column'] });
        const result = await adviseIndexes('SELECT * FROM "odd\'table" AS "alias" WHERE "alias"."odd""column" = ?', read);
        expect(result.missingIndexes[0]).toContain('ON "odd\'table" ("odd""column")');
        expect(read.mock.calls[0][1]).toEqual(["odd'table"]);
        for (const [sql] of read.mock.calls) expect(sql).not.toContain("odd'table");
    });

    it('keeps generated names deterministic and compatible with the Firebird 2.5 length limit', async () => {
        const sql = 'SELECT * FROM "abcdefghijklmnopqrstuvwxyz12345" WHERE ID = ?';
        const first = await adviseIndexes(sql, reader()), second = await adviseIndexes(sql, reader());
        expect(first).toEqual(second);
        expect(first.missingIndexes[0].match(/INDEX "([^"]+)"/)![1].length).toBeLessThanOrEqual(31);
    });

    it('does not recommend unknown, BLOB, array, computed columns or views', async () => {
        const read = reader(); read.mockImplementation(async sql => sql.includes('JOIN RDB$FIELDS') ? [{ FIELD_NAME: 'A', IS_INDEXABLE: 0, IS_VIEW: 0 }] : []);
        expect((await adviseIndexes('SELECT * FROM T WHERE A = 1 OR UNKNOWN = 1', read)).missingIndexes).toEqual([]);
        expect((await adviseIndexes('SELECT * FROM T WHERE A = 1', reader([], { view: true }))).missingIndexes).toEqual([]);
    });

    it.each([
        'SELECT * FROM T', 'SELECT * FROM T JOIN U ON T.ID=U.ID', 'SELECT * FROM T, U WHERE T.ID=U.ID',
        'SELECT * FROM (SELECT * FROM T) X WHERE ID=1', 'WITH X AS (SELECT * FROM T) SELECT * FROM X WHERE ID=1',
        'SELECT * FROM T ORDER BY ABS(A)', 'SELECT * FROM T ORDER BY A DESC, B ASC', 'SELECT * FROM T ORDER BY A,',
        'SELECT * FROM RDB$RELATIONS WHERE ID=1', "SELECT * FROM T WHERE NAME LIKE 'WHERE ID = 1 ORDER BY A'"
    ])('declines unsupported SQL without fabricated DDL: %s', async sql => {
        const read = reader(); const result = await adviseIndexes(sql, read);
        expect(result.missingIndexes).toEqual([]); expect(result.recommendations.join(' ')).toMatch(/not evidence/);
        expect(read).not.toHaveBeenCalled();
    });

    it('rejects unauthorized table/SELECT access before metadata reads', async () => {
        const read = reader(); securityConfig.allowedTables = ['PUBLIC_DATA'];
        await expect(adviseIndexes('SELECT * FROM PRIVATE_DATA WHERE ID=1', read)).rejects.toThrow();
        securityConfig.allowedTables = []; securityConfig.allowedOperations = ['UPDATE'];
        await expect(adviseIndexes('SELECT * FROM T WHERE ID=1', read)).rejects.toThrow();
        expect(read).not.toHaveBeenCalled();
    });

    it('never generates unverified DDL when catalog reads fail', async () => {
        const read = reader(); read.mockRejectedValue(new Error('catalog denied'));
        await expect(adviseIndexes('SELECT * FROM T WHERE ID=1', read)).rejects.toThrow('catalog denied');
    });

    it.each([
        { rows: index('', ['ID']) },
        { rows: [...index('MASKED_NAME', ['ID']), ...index('MASKED_NAME', ['A'])] },
        { rows: index('IX_OTHER', ['UNKNOWN']) }
    ])('declines incomplete/transformed catalog coverage: %p', async ({ rows }) => {
        await expect(adviseIndexes('SELECT * FROM T WHERE A=1', reader(rows))).rejects.toMatchObject({ type: 'METADATA_VALIDATION_ERROR' });
    });
});
