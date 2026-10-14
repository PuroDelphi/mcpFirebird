import { DEFAULT_SECURITY_CONFIG, securityConfig, SecurityConfig } from '../../security/config.js';
import { prepareUserQuery } from '../../security/sqlPolicy.js';

const queries = [
    'SELECT FIRST 1 ID FROM DEPARTMENT ORDER BY ( ID ) ;',
    'SELECT CODE FROM DEPARTMENT GROUP BY ( CODE ) ;',
    "SELECT FIRST 1 ID FROM DEPARTMENT WHERE CODE LIKE ( 'I%' ) ;",
    "SELECT ID FROM DEPARTMENT WHERE CODE NOT LIKE ( 'I!_%' ) ESCAPE ( '!' )",
    "SELECT FIRST 1 ID FROM DEPARTMENT WHERE CODE CONTAINING ( 'IRL' ) ;",
    "SELECT FIRST 1 ID FROM DEPARTMENT WHERE CODE STARTING WITH ( 'IRL' ) ;",
    "SELECT ID FROM DEPARTMENT WHERE CODE STARTS WITH ( 'IRL' )",
    "SELECT ID FROM DEPARTMENT WHERE CODE STARTING ( 'IRL' )",
    "SELECT FIRST 1 ID FROM DEPARTMENT WHERE CODE SIMILAR TO ( 'IRL%' ) ;",
    'SELECT ID FROM DEPARTMENT WHERE ID IS DISTINCT FROM ( 1 )',
    'SELECT ID FROM DEPARTMENT WHERE ID IS NOT DISTINCT FROM ( 1 )',
    'SELECT ID FROM DEPARTMENT WHERE ID BETWEEN ( 1 ) AND ( 2 )',
    'SELECT ( ID + 1 ) FROM DEPARTMENT WHERE ( ID = 1 ) OR ( ID = 2 )',
    'SELECT CASE WHEN ( ID = 1 ) THEN ( 2 ) ELSE ( 3 ) END FROM DEPARTMENT',
    'SELECT FIRST ( 1 ) SKIP ( 0 ) ID FROM DEPARTMENT',
    'SELECT CAST ( ID AS DECIMAL ( 10 , 2 ) ) FROM DEPARTMENT',
    'SELECT CODE , SUM ( ID ) FROM DEPARTMENT GROUP BY ( CODE ) HAVING ( SUM ( ID ) > 0 )',
    'SELECT A.ID FROM DEPARTMENT A JOIN CONTACT B ON ( A.ID = B.ID )',
    'SELECT ID FROM DEPARTMENT WHERE ID IN ( SELECT ID FROM CONTACT )',
    'SELECT ID FROM DEPARTMENT WHERE EXISTS ( SELECT ID FROM CONTACT )',
    'SELECT ID FROM DEPARTMENT WHERE ID IS DISTINCT FROM ( SELECT ID FROM CONTACT )',
    'SELECT FIRST 1 ID , ROW_NUMBER ( ) OVER ( ORDER BY ID ) FROM DEPARTMENT ;',
    'SELECT ID , ROW_NUMBER ( ) OVER ( PARTITION BY ( CODE ) ORDER BY ( ID ) ) FROM DEPARTMENT',
    'SELECT SUM ( ID ) OVER ( ORDER BY ID ROWS BETWEEN ( 1 ) PRECEDING AND CURRENT ROW ) FROM DEPARTMENT',
    'SELECT SUM ( ID ) FILTER ( WHERE ( ID > 0 ) ) OVER ( ) FROM DEPARTMENT',
    'SELECT ROW_NUMBER ( ) OVER W , SUM ( ID ) OVER V FROM DEPARTMENT WINDOW W AS ( ORDER BY ( ID ) ) , V AS ( PARTITION BY ( CODE ) )'
];
const windows = [
    ['ROW_NUMBER', ''], ['RANK', ''], ['DENSE_RANK', ''], ['PERCENT_RANK', ''], ['CUME_DIST', ''],
    ['NTILE', '2'], ['LEAD', 'ID'], ['LAG', 'ID'], ['FIRST_VALUE', 'ID'], ['LAST_VALUE', 'ID'], ['NTH_VALUE', 'ID, 2']
];
const unsafe = [
    'SELECT ID FROM DEPARTMENT ORDER BY ( PRIVATE_FUNCTION ( ID ) )',
    "SELECT ID FROM DEPARTMENT WHERE CODE LIKE ( PRIVATE_FUNCTION ( CODE ) )",
    "SELECT ID FROM DEPARTMENT WHERE CODE STARTING WITH ( PKG.ABS ( ID ) )",
    'SELECT ROW_NUMBER ( ) OVER ( PARTITION BY ( PRIVATE_FUNCTION ( ID ) ) ) FROM DEPARTMENT',
    'SELECT LEAD ( PRIVATE_FUNCTION ( ID ) ) OVER ( ORDER BY ID ) FROM DEPARTMENT',
    'SELECT SUM ( ID ) FILTER ( WHERE PRIVATE_FUNCTION ( ID ) = 1 ) FROM DEPARTMENT',
    'SELECT ROW_NUMBER ( ) OVER W FROM DEPARTMENT WINDOW W AS ( ORDER BY PRIVATE_FUNCTION ( ID ) )',
    'SELECT ID FROM DEPARTMENT ORDER BY ( SELECT ID FROM RDB$RELATIONS )',
    'SELECT ID FROM DEPARTMENT WHERE CODE LIKE ( SELECT CODE FROM MON$ATTACHMENTS )',
    'SELECT ID FROM DEPARTMENT WHERE ID IS NOT DISTINCT FROM ( SELECT ID FROM RDB$RELATIONS )',
    'SELECT ID FROM DEPARTMENT WHERE ID IS DISTINCT FROM ( SELECT ID FROM DEPARTMENT , RDB$RELATIONS )',
    'SELECT PKG.ROW_NUMBER ( ) OVER ( ORDER BY ID ) FROM DEPARTMENT',
    'SELECT "ROW_NUMBER" ( ) OVER ( ORDER BY ID ) FROM DEPARTMENT',
    'SELECT BY ( ID ) FROM DEPARTMENT',
    'SELECT WITH ( ID ) FROM DEPARTMENT',
    'SELECT TO ( ID ) FROM DEPARTMENT',
    'SELECT OVER ( ID ) FROM DEPARTMENT',
    'SELECT FILTER ( ID ) FROM DEPARTMENT',
    'SELECT VARCHAR ( ID ) FROM DEPARTMENT',
    ...['LIKE', 'CONTAINING', 'STARTING', 'STARTS', 'ESCAPE'].map(name => `SELECT ${name} ( ID ) FROM DEPARTMENT`),
    ...windows.map(([name, args]) => `SELECT ${name} ( ${args} ) FROM DEPARTMENT`),
    'SELECT NEXT VALUE FOR SEQ FROM DEPARTMENT ORDER BY ( ID )',
    'SELECT GEN_ID ( SEQ , 1 ) FROM DEPARTMENT ORDER BY ( ID )',
    'SELECT ID FROM DEPARTMENT ORDER BY ( ID ) ; DELETE FROM DEPARTMENT',
    ...['BY', 'LIKE', 'CONTAINING', 'WITH', 'TO', 'OVER', 'AS', 'IN', 'ROWS'].flatMap(name => [
        `SELECT PKG.${name} ( ID ) FROM DEPARTMENT`, `SELECT "${name}" ( ID ) FROM DEPARTMENT`
    ])
];

function reset(policy: Partial<SecurityConfig> = {}) {
    for (const key of Object.keys(securityConfig) as Array<keyof SecurityConfig>) delete securityConfig[key];
    Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG), structuredClone(policy));
}

describe('SQL parentheses are syntax, not opaque routines (#44)', () => {
    const original = structuredClone(securityConfig);
    const raw = process.env.ALLOW_RAW_SQL;
    beforeEach(() => { reset(); delete process.env.ALLOW_RAW_SQL; });
    afterAll(() => { reset(original); if (raw === undefined) delete process.env.ALLOW_RAW_SQL; else process.env.ALLOW_RAW_SQL = raw; });

    const policies: Array<[string, Partial<SecurityConfig>]> = [
        ['reporter policy', { allowedOperations: ['SELECT', 'EXECUTE'], forbiddenTables: [], sql: { allowUnsafeQueries: false, allowSystemTables: false } }],
        ['SELECT-only policy', { allowedOperations: ['SELECT'], sql: { allowSystemTables: false } }]
    ];
    const layouts = [
        ['original', (sql: string) => sql],
        ['comments', (sql: string) => sql.split(' ').join(' /* BY ( FROM OVER SELECT ) */\n')],
        ['lowercase', (sql: string) => sql.split(' ').map(word => /^[A-Z_]+$/.test(word) ? word.toLowerCase() : word).join('\n')]
    ] as const;
    describe.each(policies)('%s', (_name, policy) => {
        describe.each(layouts)('%s', (_layout, render) => {
            it.each(queries)('accepts valid grouping without changing SQL: %s', sql => {
                reset(policy); const rendered = render(sql);
                expect(prepareUserQuery(rendered)).toEqual({ sql: rendered, operation: 'SELECT', aliases: {} });
            });
            it.each(unsafe)('does not exempt nested routines or relations: %s', sql => {
                reset(policy); expect(() => prepareUserQuery(render(sql))).toThrow();
            });
        });
        it.each(windows)('recognizes the unqualified builtin %s', (name, args) => {
            reset(policy);
            const sql = `SELECT ${name}(${args}) OVER (ORDER BY (ID)) FROM DEPARTMENT`;
            expect(prepareUserQuery(sql).sql).toBe(sql);
        });
    });

    it('preserves row filtering around grouped expressions', () => {
        reset({ allowedTables: ['DEPARTMENT'], rowFilters: { DEPARTMENT: 'VISIBLE = 1' }, sql: { allowUnsafeQueries: false } });
        expect(prepareUserQuery('SELECT ID FROM DEPARTMENT WHERE CODE LIKE (?) ORDER BY (ID)').sql)
            .toBe('SELECT ID FROM (SELECT * FROM DEPARTMENT WHERE (VISIBLE = 1)) DEPARTMENT WHERE CODE LIKE (?) ORDER BY (ID)');
    });
    it('keeps masking restrictions on expression projections', () => {
        reset({ dataMasking: [{ columns: ['ID'], pattern: '.*', replacement: 'hidden' }], sql: { allowUnsafeQueries: false } });
        expect(() => prepareUserQuery('SELECT ROW_NUMBER() OVER (ORDER BY ID) FROM DEPARTMENT')).toThrow('Masking requires');
    });
    it('still checks an explicitly denied table', () => {
        reset({ forbiddenTables: ['DEPARTMENT'], sql: { allowUnsafeQueries: false } });
        expect(() => prepareUserQuery('SELECT ID FROM DEPARTMENT ORDER BY (ID)')).toThrow();
    });
    it('does not exempt nested opaque routines even with the trusted-query switch', () => {
        reset({ sql: { allowUnsafeQueries: true, allowSystemTables: false } }); process.env.ALLOW_RAW_SQL = 'true';
        expect(() => prepareUserQuery('SELECT ID FROM DEPARTMENT ORDER BY (PRIVATE_FUNCTION(ID))')).toThrow('Unrecognized SQL function');
    });
    it('preserves the default availability of opaque routines', () => {
        const sql = 'SELECT PRIVATE_FUNCTION(ID) FROM DEPARTMENT ORDER BY (ID)';
        expect(prepareUserQuery(sql).sql).toBe(sql);
    });
});
