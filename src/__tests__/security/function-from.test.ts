import { DEFAULT_SECURITY_CONFIG, securityConfig } from '../../security/config.js';
import { prepareUserQuery } from '../../security/sqlPolicy.js';

describe('function argument separators are not relation clauses (#36)', () => {
    beforeEach(() => {
        for (const key of Object.keys(securityConfig)) delete (securityConfig as any)[key];
        Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG), {
            allowedOperations: ['SELECT'],
            allowedTables: ['MY_TABLE'],
            sql: {allowSystemTables:false, allowUnsafeQueries:false}
        });
    });
    it.each([
        'SELECT T.ID, EXTRACT(MONTH FROM T.CREATED_AT) AS MON FROM MY_TABLE T;',
        'SELECT EXTRACT(MONTH FROM CREATED_AT) FROM MY_TABLE',
        'SELECT EXTRACT(YEAR FROM "T"."CREATED_AT") FROM "MY_TABLE" "T"',
        'SELECT EXTRACT(MONTH FROM (T.CREATED_AT)) FROM MY_TABLE T',
        'SELECT COALESCE(EXTRACT(MONTH FROM T.CREATED_AT), 0) FROM MY_TABLE T',
        'SELECT SUBSTRING(T.NAME FROM 1 FOR 3) FROM MY_TABLE T',
        'SELECT SUBSTRING(T.NAME FROM T.START_POS FOR T.LEN) FROM MY_TABLE T',
        'SELECT SUBSTRING(T.NAME FROM (1 + 1) FOR (2 + 1)) FROM MY_TABLE T',
        "SELECT TRIM(LEADING 'x' FROM T.NAME) FROM MY_TABLE T",
        "SELECT TRIM(BOTH FROM SUBSTRING(T.NAME FROM 1 FOR 3)) FROM MY_TABLE T",
        'SELECT T.ID FROM MY_TABLE T WHERE EXTRACT(MONTH FROM T.CREATED_AT) = ?',
        'SELECT EXTRACT(MONTH FROM T.CREATED_AT), COUNT(*) FROM MY_TABLE T GROUP BY EXTRACT(MONTH FROM T.CREATED_AT) ORDER BY EXTRACT(MONTH FROM T.CREATED_AT)',
        "SELECT EXTRACT(/* FROM fake.table */ MONTH FROM T.CREATED_AT), 'FROM fake.table' FROM MY_TABLE T"
    ])('accepts the builtin expression while checking the actual relation: %s', sql => {
        expect(prepareUserQuery(sql).sql).toBe(sql);
    });
    it('rewrites the actual table for row filters, never the function argument', () => {
        securityConfig.rowFilters = {MY_TABLE:'VISIBLE = 1'};
        expect(prepareUserQuery('SELECT EXTRACT(MONTH FROM T.CREATED_AT) FROM MY_TABLE T WHERE ID = ? OR 1=1').sql)
            .toBe('SELECT EXTRACT(MONTH FROM T.CREATED_AT) FROM (SELECT * FROM MY_TABLE WHERE (VISIBLE = 1)) T WHERE ID = ? OR 1=1');
    });
    it.each([
        'SELECT EXTRACT(MONTH FROM T.CREATED_AT) FROM PRIVATE_DATA T',
        'SELECT EXTRACT(MONTH FROM T.CREATED_AT) FROM SCHEMA_NAME.MY_TABLE T',
        'SELECT EXTRACT(MONTH FROM T.CREATED_AT) FROM MY_TABLE T, PRIVATE_DATA P',
        'SELECT EXTRACT(MONTH FROM (SELECT CREATED_AT FROM PRIVATE_DATA)) FROM MY_TABLE',
        'SELECT SUBSTRING((SELECT NAME FROM PRIVATE_DATA) FROM 1 FOR 2) FROM MY_TABLE',
        "SELECT TRIM('x' FROM (SELECT NAME FROM PRIVATE_DATA)) FROM MY_TABLE",
        'SELECT EXTRACT(MONTH FROM SECRET_FUNCTION()) FROM MY_TABLE',
        'SELECT EXTRACT(MONTH FROM T.CREATED_AT) FROM MY_TABLE T; SELECT * FROM PRIVATE_DATA'
    ])('still rejects restricted or opaque access: %s', sql => {
        expect(() => prepareUserQuery(sql)).toThrow();
    });
    it.each([
        'SELECT EXTRACT(MONTH FROM (SELECT CREATED_AT FROM RDB$RELATIONS)) FROM MY_TABLE',
        'SELECT SUBSTRING((SELECT NAME FROM MON$ATTACHMENTS) FROM 1) FROM MY_TABLE',
        'SELECT TRIM((SELECT NAME FROM SEC$USERS)) FROM MY_TABLE',
        'SELECT EXTRACT(MONTH FROM (SELECT CREATED_AT FROM SCHEMA_NAME.PRIVATE_DATA)) FROM MY_TABLE'
    ])('still checks nested FROM clauses without a single-table policy: %s', sql => {
        delete securityConfig.allowedTables;
        expect(() => prepareUserQuery(sql)).toThrow();
    });
    it('continues rejecting expression projections when masking is enabled', () => {
        securityConfig.dataMasking = [{columns:['CREATED_AT'],pattern:'.*',replacement:'hidden'}];
        expect(() => prepareUserQuery('SELECT EXTRACT(MONTH FROM T.CREATED_AT) FROM MY_TABLE T')).toThrow('Masking requires');
    });
});
