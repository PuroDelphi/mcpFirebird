import { DEFAULT_SECURITY_CONFIG, initSecurityConfig, loadSecurityConfig, securityConfig } from '../../security/config.js';
import { prepareUserQuery } from '../../security/sqlPolicy.js';
import { checkQueryCountLimit, checkRateLimit, checkResponseSizeLimit, checkRowLimit, resetQueryCount, resetRateLimit } from '../../security/resourceLimits.js';

describe('opt-in security compatibility', () => {
    const env = { ...process.env };
    beforeEach(() => {
        for (const key of ['FIREBIRD_SECURITY_CONFIG', 'SECURITY_CONFIG', 'SECURITY_CONFIG_PATH', 'FIREBIRD_SECURITY_JSON', 'ALLOW_RAW_SQL']) delete process.env[key];
        initSecurityConfig(); resetQueryCount(); resetRateLimit();
    });
    afterEach(() => { process.env = { ...env }; });

    it.each([
        'SELECT * FROM RDB$RELATIONS', 'SELECT * FROM MON$ATTACHMENTS',
        'EXECUTE PROCEDURE P_TEST(1)', 'SELECT * FROM P_SELECTABLE(1)',
        'SELECT A.ID FROM A, B WHERE A.ID = B.ID',
        'SELECT A.ID FROM A JOIN B ON A.ID = B.ID',
        'WITH X AS (SELECT ID FROM A) SELECT * FROM X',
        'SELECT SUBSTRING(NAME FROM 1 FOR 3), MY_UDF(ID) FROM A',
        "SELECT RDB$GET_CONTEXT('SYSTEM', 'ENGINE_VERSION') FROM RDB$DATABASE",
        'SELECT NEXT VALUE FOR SEQ FROM A', 'SELECT GEN_ID(SEQ, 1) FROM A',
        'SELECT * FROM A WHERE EXISTS (SELECT 1 FROM B WHERE B.ID = A.ID)'
    ])('keeps legacy SQL without an advanced policy: %s', sql => {
        expect(prepareUserQuery(sql).sql).toBe(sql);
    });
    it.each(['INSERT INTO T VALUES (1)', 'UPDATE T SET ID = 2', 'DELETE FROM T',
        'CREATE TABLE T (ID INTEGER)', 'ALTER TABLE T ADD NAME VARCHAR(20)', 'DROP TABLE T'])('retains the existing raw-write opt-in: %s', sql => {
        expect(() => prepareUserQuery(sql)).toThrow('ALLOW_RAW_SQL');
        process.env.ALLOW_RAW_SQL = 'true';
        expect(() => prepareUserQuery(sql)).not.toThrow();
    });
    it.each(['SELECT * FROM T; DELETE FROM T', 'SELECT * FROM T UNION SELECT * FROM U',
        'SELECT * FROM T -- comment', 'SELECT * FROM T /* comment */'])('retains baseline validation: %s', sql => {
        expect(() => prepareUserQuery(sql)).toThrow();
    });
    it('has no implicit row, size, timeout, count or rate caps', () => {
        expect(loadSecurityConfig()).toEqual(DEFAULT_SECURITY_CONFIG);
        expect(securityConfig.queryTimeout).toBeUndefined();
        expect(securityConfig.resourceLimits).toEqual({});
        expect(checkRowLimit(100000)).toBe(true);
        expect(checkResponseSizeLimit('x'.repeat(6 * 1024 * 1024))).toBe(true);
        for (let i = 0; i < 150; i++) {
            expect(checkQueryCountLimit()).toBe(true);
            expect(checkRateLimit()).toBe(true);
        }
    });
    it.each(['{"security":{}}', '{"security":{"resourceLimits":{}}}', '{"sql":{}}'])('does not enable controls for empty sections: %s', json => {
        process.env.FIREBIRD_SECURITY_JSON = json; initSecurityConfig();
        expect(securityConfig).toEqual(DEFAULT_SECURITY_CONFIG);
        expect(() => prepareUserQuery('EXECUTE PROCEDURE P_TEST')).not.toThrow();
    });
    it('enables only the resource limit explicitly supplied', () => {
        process.env.FIREBIRD_SECURITY_JSON = '{"security":{"resourceLimits":{"maxResponseSize":100}}}';
        initSecurityConfig();
        expect(securityConfig.resourceLimits).toEqual({maxResponseSize:100});
        expect(securityConfig.queryTimeout).toBeUndefined();
        expect(checkRowLimit(100000)).toBe(true);
        expect(() => checkResponseSizeLimit('x'.repeat(101))).toThrow();
        expect(() => prepareUserQuery('EXECUTE PROCEDURE P_TEST')).not.toThrow();
        for (let i = 0; i < 150; i++) { checkRateLimit(); checkQueryCountLimit(); }
    });
    it('keeps SQL switches independent and honors explicit false', () => {
        process.env.FIREBIRD_SECURITY_JSON = '{"sql":{"allowDDL":false}}'; initSecurityConfig();
        expect(securityConfig.sql).toEqual({allowDDL:false});
        process.env.ALLOW_RAW_SQL = 'true';
        expect(() => prepareUserQuery('CREATE TABLE T (ID INTEGER)')).toThrow('allowDDL');
        expect(() => prepareUserQuery('SELECT * FROM RDB$RELATIONS')).not.toThrow();
        expect(() => prepareUserQuery('EXECUTE PROCEDURE P_TEST')).not.toThrow();
        expect(() => prepareUserQuery('SELECT * FROM A, B')).not.toThrow();
    });
    it('enforces operation restrictions even with the legacy write switch', () => {
        process.env.ALLOW_RAW_SQL = 'true';
        securityConfig.forbiddenOperations = ['DROP'];
        expect(() => prepareUserQuery('DROP TABLE T')).toThrow('forbidden');
        securityConfig.allowedOperations = ['SELECT'];
        expect(() => prepareUserQuery('UPDATE T SET ID = 1')).toThrow('not allowed');
        expect(() => prepareUserQuery('SELECT SIDE_EFFECT() FROM T')).toThrow();
        expect(() => prepareUserQuery('SELECT GEN_ID(SEQ, 1) FROM T')).toThrow();
        expect(() => prepareUserQuery('SELECT COUNT(*) FROM T')).not.toThrow();
        securityConfig.sql = {allowUnsafeQueries:true};
        expect(() => prepareUserQuery('SELECT SIDE_EFFECT() FROM T')).toThrow();
    });
    it('enforces catalog restrictions without silently enabling unrelated quotas', () => {
        process.env.FIREBIRD_SECURITY_JSON = '{"sql":{"allowedSystemTables":["RDB$RELATIONS"]}}'; initSecurityConfig();
        expect(() => prepareUserQuery('SELECT * FROM RDB$RELATIONS')).not.toThrow();
        expect(() => prepareUserQuery('SELECT * FROM MON$ATTACHMENTS')).toThrow();
        // Opaque routines could evade the explicitly requested catalog policy.
        securityConfig.sql!.allowUnsafeQueries = true;
        process.env.ALLOW_RAW_SQL = 'true';
        expect(() => prepareUserQuery('EXECUTE PROCEDURE P_TEST')).toThrow();
        expect(securityConfig.resourceLimits).toEqual({});
    });
    it('enforces scoped policies even when SQL options are omitted', () => {
        securityConfig.allowedTables = ['PUBLIC_DATA'];
        expect(() => prepareUserQuery('SELECT * FROM PUBLIC_DATA')).not.toThrow();
        expect(() => prepareUserQuery('SELECT * FROM PRIVATE_DATA')).toThrow();
        expect(() => prepareUserQuery('EXECUTE PROCEDURE P_TEST')).toThrow();
    });
});
