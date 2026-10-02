import { DEFAULT_SECURITY_CONFIG, securityConfig, SecurityConfig } from '../../security/config.js';
import { prepareUserQuery } from '../../security/sqlPolicy.js';

// Independent token fixtures: do not use the production lexer to generate its
// own test inputs. Formatting must not change either acceptance or rejection.
const syntax = [
    ['derived source', 'SELECT * FROM ( SELECT ID , CODE FROM TABLENAME ) T'],
    ['derived join', 'SELECT T.ID , C.N FROM TABLENAME T JOIN ( SELECT ID , COUNT ( ID ) AS N FROM CONTACT GROUP BY ID ) C ON C.ID = T.ID'],
    ['named-column join', 'SELECT * FROM TABLENAME T LEFT JOIN ( SELECT ID FROM CONTACT ) C USING ( ID )'],
    ['nested sources', 'SELECT * FROM ( SELECT * FROM ( SELECT ID FROM TABLENAME ) T ) D'],
    ['nested predicate', 'SELECT * FROM TABLENAME T WHERE EXISTS ( SELECT 1 FROM ( SELECT ID FROM CONTACT ) C WHERE C.ID = T.ID )'],
    ['extract separator', 'SELECT * FROM ( SELECT EXTRACT ( MONTH FROM CREATED_AT ) AS M FROM TABLENAME ) T'],
    ['substring separators', 'SELECT * FROM ( SELECT SUBSTRING ( CODE FROM 1 FOR 2 ) AS C FROM TABLENAME ) T'],
    ['trim separator', 'SELECT * FROM ( SELECT TRIM ( CODE ) AS C FROM TABLENAME ) T'],
    ['quoted syntax identifiers', 'SELECT "FROM" , "JOIN" FROM ( SELECT "FROM" , "JOIN" FROM TABLENAME ) "USING"']
] as const;

const unsafe = [
    ['nested catalog', 'SELECT * FROM ( SELECT * FROM RDB$RELATIONS ) T'],
    ['deep catalog', 'SELECT * FROM ( SELECT * FROM ( SELECT * FROM "SEC$USERS" ) U ) T'],
    ['opaque function', 'SELECT * FROM ( SELECT PRIVATE_FUNCTION ( ID ) FROM TABLENAME ) T'],
    ['qualified builtin name', 'SELECT * FROM ( SELECT PKG.ABS ( ID ) FROM TABLENAME ) T'],
    ['quoted function name', 'SELECT * FROM ( SELECT "FROM" ( ID ) FROM TABLENAME ) T'],
    ['function inside USING', 'SELECT * FROM TABLENAME T JOIN CONTACT C USING ( PRIVATE_FUNCTION ( ID ) )'],
    ['hidden comma source', 'SELECT * FROM ( SELECT ID FROM TABLENAME ) "WHERE" , RDB$RELATIONS R'],
    ['selectable procedure', 'SELECT * FROM ( SELECT * FROM PRIVATE_PROCEDURE ( 1 ) ) T'],
    ['sequence mutation', 'SELECT * FROM ( SELECT NEXT VALUE FOR PRIVATE_SEQ FROM TABLENAME ) T'],
    ['extra statement', 'SELECT * FROM ( SELECT ID FROM TABLENAME ) T ; SELECT * FROM CONTACT']
] as const;

const layouts = [
    ['spaces', (tokens: string[]) => tokens.join(' ')],
    ['newlines', (tokens: string[]) => tokens.join('\n\t')],
    ['block comments', (tokens: string[]) => tokens.join('/* FROM ( JOIN USING SELECT ) */')],
    ['line comments', (tokens: string[]) => tokens.join(' -- FROM ( JOIN USING SELECT )\n')],
    ['lowercase', (tokens: string[]) => tokens.map(t => /^[A-Z_][A-Z0-9_$]*$/.test(t) ? t.toLowerCase() : t).join(' ') + ';']
] as const;

const reporterPolicy: Partial<SecurityConfig> = {
    allowedOperations: ['SELECT', 'EXECUTE'],
    forbiddenOperations: ['DROP', 'TRUNCATE', 'ALTER', 'INSERT', 'UPDATE', 'DELETE', 'GRANT', 'REVOKE'],
    forbiddenTables: [],
    resourceLimits: { maxRowsPerQuery: 1000, maxQueryCpuTime: 30000 },
    sql: { allowSystemTables: false, allowDDL: false, allowUnsafeQueries: false }
};

function resetPolicy(policy: Partial<SecurityConfig>) {
    for (const key of Object.keys(securityConfig) as Array<keyof SecurityConfig>) delete securityConfig[key];
    Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG), structuredClone(policy));
}

describe('SQL syntax/policy regression matrix (#36, #41)', () => {
    const original = structuredClone(securityConfig);
    const rawSql = process.env.ALLOW_RAW_SQL;
    beforeEach(() => { delete process.env.ALLOW_RAW_SQL; });
    afterAll(() => {
        resetPolicy(original);
        if (rawSql === undefined) delete process.env.ALLOW_RAW_SQL;
        else process.env.ALLOW_RAW_SQL = rawSql;
    });

    describe.each(layouts)('%s', (_layout, render) => {
        const policies: Array<[string, Partial<SecurityConfig>]> = [
            ['reporter policy (empty denylist)', reporterPolicy],
            ['SELECT-only with catalogs denied', { allowedOperations: ['SELECT'], sql: { allowSystemTables: false } }]
        ];
        describe.each(policies)('%s', (_name, policy) => {
            it.each(syntax)('preserves supported SQL verbatim: %s', (_syntax, template) => {
                resetPolicy(policy);
                const sql = render(template.split(' '));
                expect(prepareUserQuery(sql)).toEqual({ sql, operation: 'SELECT', aliases: {} });
            });
        });

        it.each(syntax)('preserves the legacy acceptance/rejection contract: %s', (_name, template) => {
            resetPolicy({});
            const sql = render(template.split(' '));
            // Historical validation rejects all SQL comments. Keep that contract
            // rather than silently changing unrelated default security behavior.
            if (_layout === 'block comments' || _layout === 'line comments') {
                expect(() => prepareUserQuery(sql)).toThrow('Invalid or potentially unsafe SQL query');
            } else {
                expect(prepareUserQuery(sql)).toEqual({ sql, operation: 'SELECT', aliases: {} });
            }
        });

        it.each(unsafe)('cannot hide a restricted construct: %s', (_name, template) => {
            resetPolicy(reporterPolicy);
            expect(() => prepareUserQuery(render(template.split(' ')))).toThrow();
        });

        it.each(syntax)('keeps a subsequently populated denylist fail-closed: %s', (_name, template) => {
            resetPolicy({ ...reporterPolicy, forbiddenTables: ['PRIVATE_DATA'] });
            expect(() => prepareUserQuery(render(template.split(' ')))).toThrow();
        });
    });
});
