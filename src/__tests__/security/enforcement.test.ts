import { DEFAULT_SECURITY_CONFIG, initSecurityConfig, loadSecurityConfig, securityConfig } from '../../security/config.js';
import { prepareUserQuery } from '../../security/sqlPolicy.js';
import { applyDataMasking } from '../../security/dataMasking.js';
import { checkAllowedTable, checkAllowedOperation } from '../../security/authorization.js';
import { securityContext } from '../../security/context.js';
import { checkRateLimit, checkQueryCountLimit, checkResponseSizeLimit, checkRowLimit, resetQueryCount, resetRateLimit } from '../../security/resourceLimits.js';

describe('security policy enforcement', () => {
    const savedEnv = { ...process.env };
    beforeEach(() => {
        for (const key of Object.keys(securityConfig)) delete (securityConfig as any)[key];
        Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG));
        securityConfig.sql = { allowSystemTables: false, allowedSystemTables: [], allowDDL: false, allowUnsafeQueries: false };
        delete process.env.ALLOW_RAW_SQL;
        for (const key of ['FIREBIRD_SECURITY_CONFIG','SECURITY_CONFIG','SECURITY_CONFIG_PATH','FIREBIRD_SECURITY_JSON']) delete process.env[key];
        resetQueryCount(); resetRateLimit();
    });
    afterAll(() => { process.env = savedEnv; });
    it.each(['SELECT * FROM RDB$RELATIONS', 'SELECT * FROM "RDB$RELATIONS"', 'select * from mon$attachments', 'SELECT * FROM SEC$USERS',
        'SELECT * FROM (SELECT * FROM RDB$RELATIONS) X', 'WITH X AS (SELECT * FROM RDB$RELATIONS) SELECT * FROM X'])('denies unapproved system access: %s', sql => {
        expect(() => prepareUserQuery(sql)).toThrow();
    });
    it('implements an explicit system read allowlist without opening all catalog tables', () => {
        securityConfig.sql!.allowedSystemTables = ['RDB$RELATIONS'];
        expect(() => prepareUserQuery('SELECT RDB$RELATION_NAME FROM RDB$RELATIONS')).not.toThrow();
        expect(() => prepareUserQuery('SELECT * FROM MON$ATTACHMENTS')).toThrow();
        securityConfig.sql!.allowSystemTables = true;
        expect(() => prepareUserQuery('SELECT * FROM MON$ATTACHMENTS')).not.toThrow();
        process.env.ALLOW_RAW_SQL = 'true'; securityConfig.allowedOperations = ['DELETE'];
        expect(() => prepareUserQuery('DELETE FROM MON$ATTACHMENTS')).toThrow('read-only');
    });
    it('requires the raw-write gate, DDL opt-in, and operation permission together', () => {
        securityConfig.allowedOperations = ['CREATE'];
        expect(() => prepareUserQuery('CREATE TABLE T (ID INTEGER)')).toThrow('ALLOW_RAW_SQL');
        process.env.ALLOW_RAW_SQL = 'true';
        expect(() => prepareUserQuery('CREATE TABLE T (ID INTEGER)')).toThrow('allowDDL');
        securityConfig.sql!.allowDDL = true;
        expect(() => prepareUserQuery('CREATE TABLE T (ID INTEGER)')).not.toThrow();
        securityConfig.forbiddenOperations = ['CREATE'];
        expect(() => prepareUserQuery('CREATE TABLE T (ID INTEGER)')).toThrow('forbidden');
    });
    it.each(['SELECT * FROM PRIVATE_DATA','SELECT * FROM PUBLIC_DATA, PRIVATE_DATA','SELECT * FROM PUBLIC_DATA JOIN PRIVATE_DATA ON 1=1',
        'SELECT * FROM PUBLIC_DATA WHERE EXISTS (SELECT 1 FROM PRIVATE_DATA)', 'WITH X AS (SELECT * FROM PRIVATE_DATA) SELECT * FROM X',
        'SELECT * FROM PUBLIC_DATA UNION SELECT * FROM PRIVATE_DATA', 'EXECUTE BLOCK AS BEGIN END',
        'SELECT STEAL_DATA() FROM PUBLIC_DATA', 'SELECT * FROM PUBLIC_DATA; DELETE FROM PRIVATE_DATA'])('rejects policy bypass: %s', sql => {
        securityConfig.allowedTables = ['PUBLIC_DATA']; securityConfig.sql!.allowUnsafeQueries = true;
        expect(() => prepareUserQuery(sql)).toThrow();
    });
    it('handles quoted strings, escaped quotes and comments without treating them as SQL', () => {
        expect(() => prepareUserQuery("/* hi */ SELECT 'DROP; it''s a string' FROM T -- test")).not.toThrow();
    });
    it('denies sequence side effects when SQL restrictions are selected', () => {
        expect(() => prepareUserQuery('SELECT NEXT VALUE FOR SEQ FROM T')).toThrow('Sequence');
        expect(() => prepareUserQuery('SELECT GEN_ID(SEQ, 1) FROM T')).toThrow();
    });
    it('adds row predicates inside a derived table before user OR, pagination, and aggregation', () => {
        securityConfig.rowFilters = { T: 'VISIBLE = 1' };
        const prepared = prepareUserQuery('SELECT FIRST 10 * FROM T WHERE ID = ? OR 1=1 ORDER BY ID');
        expect(prepared.sql).toBe('SELECT FIRST 10 * FROM (SELECT * FROM T WHERE (VISIBLE = 1)) T WHERE ID = ? OR 1=1 ORDER BY ID');
        expect(prepareUserQuery('SELECT COUNT(*) FROM T').sql).toContain('(SELECT * FROM T WHERE (VISIBLE = 1)) T');
        process.env.ALLOW_RAW_SQL = 'true'; securityConfig.allowedOperations = ['UPDATE'];
        expect(() => prepareUserQuery('UPDATE T SET VISIBLE = 1')).toThrow('read-only');
    });
    it('preserves table aliases for row filtering', () => {
        securityConfig.rowFilters = { T: 'VISIBLE = 1' };
        expect(prepareUserQuery('SELECT A.ID FROM T AS A').sql).toBe('SELECT A.ID FROM (SELECT * FROM T WHERE (VISIBLE = 1)) AS A');
    });
    it('canonicalizes trailing spaces in delimited identifiers before policy checks', () => {
        securityConfig.forbiddenTables = ['PRIVATE_DATA'];
        expect(() => prepareUserQuery('SELECT * FROM "PRIVATE_DATA "')).toThrow('forbidden');
        securityConfig.dataMasking = [{columns:['SSN'],pattern:'^.*$',replacement:'hidden'}];
        const prepared = prepareUserQuery('SELECT "SSN " AS OTHER FROM T');
        expect(applyDataMasking([{OTHER:'secret'}],prepared.aliases)).toEqual([{OTHER:'hidden'}]);
    });
    it('masks direct aliases and blocks expression and duplicate-alias evasions', () => {
        securityConfig.dataMasking = [{ columns: ['SSN'], pattern: '^.*$', replacement: '[hidden]' }];
        const prepared = prepareUserQuery('SELECT SSN AS OTHER, NAME FROM T');
        expect(applyDataMasking([{ OTHER: '123', NAME: 'Public' }], prepared.aliases)).toEqual([{ OTHER: '[hidden]', NAME: 'Public' }]);
        expect(() => prepareUserQuery('SELECT SUBSTRING(SSN FROM 1 FOR 3) AS OTHER FROM T')).toThrow();
        expect(() => prepareUserQuery('SELECT SSN AS X, NAME AS X FROM T')).toThrow();
        securityConfig.dataMasking[0].pattern = '[';
        expect(() => applyDataMasking([{ SSN: '123' }])).toThrow('withheld');
    });
    it('validates nested settings and accepts either documented SQL location', () => {
        process.env.FIREBIRD_SECURITY_JSON = JSON.stringify({ security: {}, sql: { allowDDL: true } });
        expect(loadSecurityConfig().sql!.allowDDL).toBe(true);
        process.env.FIREBIRD_SECURITY_JSON = JSON.stringify({ security: { sql: { allowSystemTables: true } } });
        expect(loadSecurityConfig().sql!.allowSystemTables).toBe(true);
        for (const value of [{ security: {}, sql: { allowDDl: true } }, {security: {resourceLimits: {queriesPerMinute: 2}}},
            {security: {dataMasking:[{columns:['S'],pattern:'[',replacement:'x'}]}}, {security:{sql:{}},sql:{}}]) {
            process.env.FIREBIRD_SECURITY_JSON = JSON.stringify(value);
            expect(() => loadSecurityConfig()).toThrow();
        }
    });
    it('removes stale restrictions on reinitialization', () => {
        securityConfig.forbiddenTables = ['T'];
        process.env.FIREBIRD_SECURITY_JSON = '{"security":{}}';
        initSecurityConfig(); expect(securityConfig.forbiddenTables).toBeUndefined();
    });
    it('combines role permissions with global denials and denies absent identities', () => {
        securityConfig.authorization = { type: 'oauth2', rolePermissions: { analyst: { tables: ['T'], operations: ['SELECT'] } } };
        expect(() => checkAllowedTable('T')).toThrow('User information');
        securityContext.run({sessionId:'a',user:{id:'a',username:'a',role:'analyst'}}, () => {
            expect(() => checkAllowedTable('T')).not.toThrow();
            expect(() => checkAllowedTable('PRIVATE')).toThrow();
            expect(() => checkAllowedOperation('EXECUTE')).toThrow();
            securityConfig.forbiddenTables = ['T']; expect(() => checkAllowedTable('T')).toThrow('forbidden');
        });
    });
    it('enforces the stricter row cap and actual UTF-8 response bytes', () => {
        securityConfig.maxRows = 2;
        expect(() => checkRowLimit(3)).toThrow();
        securityConfig.resourceLimits!.maxResponseSize = 8;
        expect(() => checkResponseSizeLimit('😊😊')).toThrow();
    });
    it('allows an initial burst, refills over time, and separates query counters', () => {
        jest.useFakeTimers();
        try {
            securityConfig.resourceLimits!.rateLimit = { queriesPerMinute: 60, burstLimit: 2 };
            expect(checkRateLimit()).toBe(true); expect(checkRateLimit()).toBe(true);
            expect(() => checkRateLimit()).toThrow();
            jest.advanceTimersByTime(1000); expect(checkRateLimit()).toBe(true);
            securityConfig.resourceLimits!.maxQueriesPerSession = 1;
            expect(checkQueryCountLimit()).toBe(true);
            expect(() => checkQueryCountLimit()).toThrow();
            expect(checkQueryCountLimit('another')).toBe(true);
        } finally { jest.useRealTimers(); }
    });
});
