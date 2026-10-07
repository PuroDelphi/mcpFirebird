import { DEFAULT_SECURITY_CONFIG, securityConfig, SecurityConfig } from '../../security/config.js';
import { prepareUserQuery } from '../../security/sqlPolicy.js';
import { securityContext } from '../../security/context.js';

const derivedQueries = [
    'SELECT * FROM (SELECT ID, CODE FROM TABLENAME) T;',
    'SELECT T.NAME, C.I_COUNT FROM TABLENAME T JOIN (SELECT ID, COUNT(ID) AS I_COUNT FROM CONTACT GROUP BY ID) C ON C.ID = T.ID;',
    'SELECT * FROM (SELECT ID FROM TABLENAME) T JOIN (SELECT ID FROM CONTACT) C USING (ID)',
    'SELECT * FROM TABLENAME T LEFT JOIN CONTACT C USING (ID, CODE)',
    'SELECT * FROM TABLENAME T FULL OUTER JOIN (SELECT "ID", "CODE" FROM CONTACT) AS C USING ("ID", "CODE")',
    'SELECT * FROM (SELECT * FROM (SELECT ID FROM TABLENAME) X) Y',
    'SELECT * FROM TABLENAME T WHERE EXISTS (SELECT 1 FROM (SELECT ID FROM CONTACT) C WHERE C.ID = T.ID)',
    'SELECT * FROM (SELECT EXTRACT(MONTH FROM T.CREATED_AT) AS MON FROM TABLENAME T) D'
];

function resetPolicy(config: Partial<SecurityConfig> = {}) {
    for (const key of Object.keys(securityConfig) as Array<keyof SecurityConfig>) delete securityConfig[key];
    Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG), structuredClone(config));
}

describe('derived relations and named-column joins (#41)', () => {
    const savedRawSql = process.env.ALLOW_RAW_SQL;
    beforeEach(() => { resetPolicy(); delete process.env.ALLOW_RAW_SQL; });
    afterAll(() => {
        if (savedRawSql === undefined) delete process.env.ALLOW_RAW_SQL;
        else process.env.ALLOW_RAW_SQL = savedRawSql;
    });

    const policies: Array<[string, Partial<SecurityConfig>]> = [
        ['default compatibility', {}],
        ['resource limits only', { maxRows: 100 }],
        ['SELECT-only operations', { allowedOperations: ['SELECT'] }],
        ['EXECUTE denial', { forbiddenOperations: ['EXECUTE'] }],
        ['catalog restrictions', { sql: { allowSystemTables: false } }],
        ['explicit conservative parsing', { sql: { allowUnsafeQueries: false } }]
    ];
    describe.each(policies)('%s', (_name, config) => {
        it.each(derivedQueries)('accepts supported syntax: %s', sql => {
            resetPolicy(config);
            expect(prepareUserQuery(sql)).toEqual({ sql, operation: 'SELECT', aliases: {} });
        });
    });

    it('recognizes syntax across comments without hiding nested checks', () => {
        securityConfig.allowedOperations = ['SELECT'];
        const sql = 'SELECT * FROM /* source */ (/* query */ SELECT ID FROM TABLENAME) T JOIN CONTACT C USING /* columns */ (ID)';
        expect(prepareUserQuery(sql).sql).toBe(sql);
    });

    it('honors a catalog allowlist inside a derived table', () => {
        securityConfig.sql = { allowedSystemTables: ['RDB$RELATIONS'] };
        const sql = 'SELECT * FROM (SELECT RDB$RELATION_NAME FROM RDB$RELATIONS) R';
        expect(prepareUserQuery(sql).sql).toBe(sql);
        expect(() => prepareUserQuery(sql.replaceAll('RDB$RELATIONS', 'MON$ATTACHMENTS'))).toThrow('System table');
    });

    it.each([
        'SELECT * FROM (SELECT * FROM RDB$RELATIONS) R',
        'SELECT * FROM TABLENAME T JOIN (SELECT * FROM MON$ATTACHMENTS) M ON 1=1',
        'SELECT * FROM (SELECT * FROM (SELECT * FROM "SEC$USERS") S) X',
        'SELECT * FROM (SELECT EXTRACT(MONTH FROM (SELECT CREATED_AT FROM RDB$RELATIONS)) AS M FROM TABLENAME) X',
        'SELECT * FROM (SELECT ID FROM TABLENAME) D, RDB$RELATIONS R',
        'SELECT * FROM (SELECT ID FROM TABLENAME) AS "WHERE", RDB$RELATIONS R',
        'SELECT * FROM (SELECT ID FROM TABLENAME) AS "GROUP", RDB$RELATIONS R',
        'SELECT * FROM TABLENAME T JOIN (SELECT ID FROM CONTACT) C ON T.ID=C.ID, RDB$RELATIONS R',
        'SELECT * FROM (SELECT * FROM TABLENAME "WHERE", RDB$RELATIONS R) D',
        "SELECT * FROM (SELECT * FROM TABLENAME T JOIN CONTACT C ON T.NAME='WHERE', RDB$RELATIONS R) D",
        'SELECT * FROM ((SELECT * FROM RDB$RELATIONS)) R',
        'SELECT * FROM (TABLENAME T JOIN RDB$RELATIONS R ON 1=1)',
        'SELECT * FROM (SELECT * FROM SCHEMA_NAME.TABLENAME) T'
    ])('never lets derived syntax hide forbidden or unsupported relations: %s', sql => {
        securityConfig.sql = { allowSystemTables: false, allowUnsafeQueries: true };
        process.env.ALLOW_RAW_SQL = 'true';
        expect(() => prepareUserQuery(sql)).toThrow();
    });

    it.each([
        'SELECT * FROM (SELECT SECRET_FUNCTION(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT "FROM"(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT "JOIN"(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT "USING"(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT PKG.SECRET_FUNCTION(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT PKG.ABS(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT "PKG".TRUNC(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT * FROM P_SELECTABLE(1)) T',
        'SELECT * FROM (SELECT GEN_ID(SEQ, 1) FROM TABLENAME) T',
        'SELECT * FROM (SELECT NEXT VALUE FOR SEQ FROM TABLENAME) T',
        'SELECT * FROM (SELECT ID FROM TABLENAME) T; SELECT * FROM CONTACT',
        'SELECT * FROM (SELECT ID FROM TABLENAME UNION SELECT ID FROM CONTACT) T',
        'SELECT * FROM (EXECUTE PROCEDURE P_TEST) T',
        'SELECT * FROM TABLENAME T JOIN CONTACT C USING (SECRET_FUNCTION(ID))',
        'SELECT * FROM TABLENAME T JOIN CONTACT C USING ()',
        'SELECT * FROM TABLENAME T JOIN CONTACT C USING (ID,)',
        'SELECT USING(ID) FROM TABLENAME',
        'SELECT * FROM TABLENAME T JOIN CONTACT C ON USING(ID)=1'
    ])('keeps routines, side effects and unsupported syntax blocked: %s', sql => {
        securityConfig.allowedOperations = ['SELECT'];
        expect(() => prepareUserQuery(sql)).toThrow();
        securityConfig.sql = { allowUnsafeQueries: true };
        process.env.ALLOW_RAW_SQL = 'true';
        // UNION is separately permitted by the explicit trusted-query flag.
        if (!sql.includes('UNION')) expect(() => prepareUserQuery(sql)).toThrow();
    });

    it.each([
        'SELECT PKG.ABS(ID) FROM TABLENAME',
        'SELECT "PKG".TRUNC(ID) FROM TABLENAME',
        'SELECT * FROM (SELECT SECRET_FUNCTION(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT PKG.ABS(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT "FROM"(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT "JOIN"(ID) FROM TABLENAME) T',
        'SELECT * FROM (SELECT "USING"(ID) FROM TABLENAME) T',
        'SELECT * FROM TABLENAME T JOIN CONTACT C ON PKG.USING(ID)=1'
    ])('does not confuse opaque calls with builtins or syntax under a catalog policy: %s', sql => {
        securityConfig.sql = { allowSystemTables: false, allowUnsafeQueries: true };
        process.env.ALLOW_RAW_SQL = 'true';
        expect(() => prepareUserQuery(sql)).toThrow('Unrecognized SQL function');
    });

    it('does not introduce routine restrictions into the compatibility path', () => {
        const sql = 'SELECT * FROM (SELECT PKG.ABS(ID) FROM TABLENAME) T';
        expect(prepareUserQuery(sql).sql).toBe(sql);
    });

    it('keeps the explicit SELECT denial ahead of syntax handling', () => {
        securityConfig.forbiddenOperations = ['SELECT'];
        expect(() => prepareUserQuery(derivedQueries[0])).toThrow('forbidden');
    });

    const scopedPolicies: Array<[string, Partial<SecurityConfig>]> = [
        ['table allowlist', { allowedTables: ['TABLENAME', 'CONTACT'] }],
        ['table denylist', { forbiddenTables: ['PRIVATE_DATA'] }],
        ['table pattern', { tableNamePattern: '^(TABLENAME|CONTACT)$' }],
        ['row filter', { rowFilters: { TABLENAME: 'VISIBLE = 1' } }],
        ['masking', { dataMasking: [{ columns: ['CODE'], pattern: '.*', replacement: 'hidden' }] }],
        ['role permissions', { authorization: { type: 'basic', rolePermissions: { analyst: { allTablesAllowed: true, operations: ['SELECT'] } } } }]
    ];
    describe.each(scopedPolicies)('preserves the single-table limit with %s', (_name, config) => {
        it.each(derivedQueries)('still rejects: %s', sql => {
            resetPolicy({ ...config, sql: { allowUnsafeQueries: true, allowSystemTables: true } });
            process.env.ALLOW_RAW_SQL = 'true';
            securityContext.run({ sessionId: 'test', user: { id: 'test', username: 'test', role: 'analyst' } }, () => {
                expect(() => prepareUserQuery(sql)).toThrow();
            });
        });
    });
});
