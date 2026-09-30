import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_SECURITY_CONFIG, loadSecurityConfig, securityConfig, MAX_SECURITY_JSON_BYTES } from '../../security/config.js';
import { initSecurity } from '../../security/index.js';
import { checkAllowedTable } from '../../security/authorization.js';
import { createAuditTable } from '../../security/audit.js';
import { ConfigError } from '../../utils/errors.js';

jest.mock('../../security/audit.js', () => ({ createAuditTable: jest.fn() }));

describe('security configuration file loading', () => {
    const envKeys = ['FIREBIRD_SECURITY_CONFIG', 'SECURITY_CONFIG', 'SECURITY_CONFIG_PATH'];
    const allEnvKeys = [...envKeys, 'FIREBIRD_SECURITY_JSON', 'QUERY_TIMEOUT'];
    let directory: string;
    let savedEnv: Array<string | undefined>;
    let originalConfig: typeof securityConfig;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-security-'));
        savedEnv = allEnvKeys.map(key => process.env[key]);
        allEnvKeys.forEach(key => delete process.env[key]);
        jest.clearAllMocks();
        originalConfig = { ...securityConfig };
    });

    afterEach(() => {
        allEnvKeys.forEach((key, index) => {
            if (savedEnv[index] === undefined) delete process.env[key];
            else process.env[key] = savedEnv[index];
        });
        for (const key of Object.keys(securityConfig)) delete (securityConfig as any)[key];
        Object.assign(securityConfig, originalConfig);
        fs.rmSync(directory, { recursive: true, force: true });
    });

    function configFile(name: string, maxRows: number) {
        const filename = path.join(directory, name);
        fs.writeFileSync(filename, JSON.stringify({ security: { maxRows, forbiddenTables: ['PRIVATE_DATA'] } }));
        return filename;
    }

    it.each(['1', '30000', ' 60000 ', '2147483647'])('loads QUERY_TIMEOUT=%s without enabling other limits', async value => {
        process.env.QUERY_TIMEOUT = value;
        await initSecurity();
        expect(securityConfig).toEqual({ ...DEFAULT_SECURITY_CONFIG, queryTimeout: Number(value) });
    });

    it.each(['', '   '])('keeps blank QUERY_TIMEOUT=%j inactive', value => {
        process.env.QUERY_TIMEOUT = value;
        expect(loadSecurityConfig()).toEqual(DEFAULT_SECURITY_CONFIG);
    });

    it.each(['0', '-1', '1.5', '30s', '1e3', '0x10', 'NaN', 'Infinity', '2147483648', '9007199254740993', 'secret-value'])('rejects invalid QUERY_TIMEOUT=%s before initializing security', async value => {
        process.env.QUERY_TIMEOUT = value;
        await expect(initSecurity()).rejects.toThrow('QUERY_TIMEOUT must be an integer');
        expect(createAuditTable).not.toHaveBeenCalled();
        expect(securityConfig).toEqual(originalConfig);
        try { loadSecurityConfig(); } catch (error) {
            expect(String(error)).not.toContain('secret-value');
        }
    });

    it.each(['inline', 'json', 'cjs'])('uses the environment fallback with %s policies without dropping restrictions', mode => {
        process.env.QUERY_TIMEOUT = '30000';
        const policy = { security: { forbiddenTables: ['PRIVATE_DATA'], resourceLimits: { maxQueryCpuTime: 5000 } } };
        let filename: string | undefined;
        if (mode === 'inline') process.env.FIREBIRD_SECURITY_JSON = JSON.stringify(policy);
        else {
            filename = path.join(directory, `timeout.${mode}`);
            fs.writeFileSync(filename, mode === 'json' ? JSON.stringify(policy) : `module.exports = ${JSON.stringify(policy)};`);
        }
        expect(loadSecurityConfig(filename)).toMatchObject({ ...policy.security, queryTimeout: 30000 });
    });

    it.each(['inline', 'json', 'cjs'])('prioritizes explicit %s queryTimeout over even an invalid environment fallback', mode => {
        process.env.QUERY_TIMEOUT = 'invalid ignored lower-priority value';
        const policy = { security: { queryTimeout: 60000 } };
        let filename: string | undefined;
        if (mode === 'inline') process.env.FIREBIRD_SECURITY_JSON = JSON.stringify(policy);
        else {
            filename = path.join(directory, `timeout.${mode}`);
            fs.writeFileSync(filename, mode === 'json' ? JSON.stringify(policy) : `module.exports = ${JSON.stringify(policy)};`);
        }
        expect(loadSecurityConfig(filename).queryTimeout).toBe(60000);
    });

    it('loads inline JSON during initialization and enforces its restrictions', async () => {
        process.env.FIREBIRD_SECURITY_JSON = JSON.stringify({ security: { forbiddenTables: ['PRIVATE_DATA'], maxRows: 7 } });
        await initSecurity();
        expect(securityConfig.maxRows).toBe(7);
        expect(() => checkAllowedTable('PRIVATE_DATA')).toThrow();
        expect(() => checkAllowedTable('PUBLIC_DATA')).not.toThrow();
        expect(securityConfig.allowedOperations).toEqual(DEFAULT_SECURITY_CONFIG.allowedOperations);
    });

    it('keeps explicit paths and each existing file variable ahead of inline JSON', () => {
        process.env.FIREBIRD_SECURITY_JSON = 'invalid ignored lower-priority value';
        const filename = configFile('priority.json', 31);
        expect(loadSecurityConfig(filename).maxRows).toBe(31);
        for (const key of envKeys) {
            process.env[key] = filename;
            expect(loadSecurityConfig().maxRows).toBe(31);
            delete process.env[key];
        }
    });

    it.each(['', ' ', '{secret-value', 'null', '[]', '{}', '{"security":null}',
        '{"security":{"maxRows":-1}}', '{"security":{"allowedTable":["PRIVATE_DATA"]}}',
        '{"security":{},"unexpected":"secret-value"}'])('rejects invalid inline policy %# before initializing audit', async json => {
        process.env.FIREBIRD_SECURITY_JSON = json;
        await expect(initSecurity()).rejects.toBeInstanceOf(ConfigError);
        expect(createAuditTable).not.toHaveBeenCalled();
        expect(securityConfig).toEqual(originalConfig);
        try { loadSecurityConfig(); } catch (error) {
            expect(String(error)).not.toContain('secret-value');
        }
    });

    it('enforces a UTF-8 byte limit before parsing', () => {
        process.env.FIREBIRD_SECURITY_JSON = 'é'.repeat(MAX_SECURITY_JSON_BYTES / 2 + 1);
        expect(() => loadSecurityConfig()).toThrow('64 KiB limit');
    });

    it('allows explicit empty policies and handles the exact size boundary', () => {
        const json = '{"security":{}}';
        process.env.FIREBIRD_SECURITY_JSON = json.padEnd(MAX_SECURITY_JSON_BYTES, ' ');
        expect(loadSecurityConfig()).toEqual(DEFAULT_SECURITY_CONFIG);
    });

    it.each(envKeys)('loads %s during no-argument security initialization and enforces the policy', async key => {
        process.env[key] = configFile('policy.json', 23);
        await initSecurity();
        expect(securityConfig.maxRows).toBe(23);
        expect(() => checkAllowedTable('PRIVATE_DATA')).toThrow();
        expect(() => checkAllowedTable('PUBLIC_DATA')).not.toThrow();
    });

    it('prioritizes explicit paths, then FIREBIRD_SECURITY_CONFIG, SECURITY_CONFIG, and SECURITY_CONFIG_PATH', () => {
        envKeys.forEach((key, i) => process.env[key] = configFile(`${i}.json`, i + 1));
        expect(loadSecurityConfig(configFile('explicit.json', 99)).maxRows).toBe(99);
        for (let i = 0; i < envKeys.length; i++) {
            expect(loadSecurityConfig().maxRows).toBe(i + 1);
            delete process.env[envKeys[i]];
        }
        expect(loadSecurityConfig()).toEqual(DEFAULT_SECURITY_CONFIG);
    });

    it('supports relative paths, UTF-8 BOM, and rereading JSON after changes', () => {
        const filename = configFile('policy.json', 10);
        expect(loadSecurityConfig(path.relative(process.cwd(), filename)).maxRows).toBe(10);
        fs.writeFileSync(filename, '\uFEFF' + JSON.stringify({ security: { maxRows: 20 } }));
        expect(loadSecurityConfig(filename).maxRows).toBe(20);
    });

    it('retains support for CommonJS configuration files', () => {
        const filename = path.join(directory, 'policy.cjs');
        fs.writeFileSync(filename, 'module.exports = { security: { maxRows: 42 } };');
        expect(loadSecurityConfig(filename).maxRows).toBe(42);
    });

    it.each(['missing', 'invalid-json', 'invalid-schema', 'missing-security'])('fails closed for %s', kind => {
        const filename = path.join(directory, 'policy.json');
        if (kind === 'invalid-json') fs.writeFileSync(filename, '{');
        if (kind === 'invalid-schema') fs.writeFileSync(filename, '{"security":{"maxRows":-1}}');
        if (kind === 'missing-security') fs.writeFileSync(filename, '{}');
        expect(() => loadSecurityConfig(filename)).toThrow(ConfigError);
    });
});
