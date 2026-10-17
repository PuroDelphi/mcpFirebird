jest.mock('../../db/connection.js', () => ({
    DEFAULT_CONFIG: {}, getGlobalConfig: jest.fn(), connectToDatabase: jest.fn(), queryDatabase: jest.fn(),
    getPool: jest.fn(() => ({ release: releaseMock, destroy: destroyMock }))
}));
jest.mock('../../security/audit.js', () => ({ logQueryExecution: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../db/driver-factory.js', () => ({
    DriverFactory: { getDriverInfo: jest.fn().mockResolvedValue({ current: 'pure', nativeAvailable: false }) }
}));
const releaseMock = jest.fn();
const destroyMock = jest.fn();
import { EventEmitter } from 'events';
import { connectToDatabase, queryDatabase } from '../../db/connection.js';
import { getFieldDescriptions, describeTable, describeBatchTables, getExecutionPlan } from '../../db/queries.js';
import { DriverFactory } from '../../db/driver-factory.js';
import { DEFAULT_SECURITY_CONFIG, securityConfig } from '../../security/config.js';
import { resetQueryCount, resetRateLimit } from '../../security/resourceLimits.js';

// Exercise the real metadata/query boundary; only driver I/O and audit persistence are mocked.
describe('issue #45: full field descriptions and honest unavailable plans', () => {
    beforeEach(() => {
        jest.clearAllMocks(); resetQueryCount(); resetRateLimit();
        for (const key of Object.keys(securityConfig)) delete (securityConfig as any)[key];
        Object.assign(securityConfig, structuredClone(DEFAULT_SECURITY_CONFIG));
        jest.mocked(connectToDatabase).mockResolvedValue({} as any);
        jest.mocked(DriverFactory.getDriverInfo).mockResolvedValue({ current: 'pure', nativeAvailable: false } as any);
    });

    it.each([514, 10000])('preserves a %i-character description in all three metadata paths', async length => {
        const description = 'á'.repeat(length);
        jest.mocked(queryDatabase).mockImplementation(async (_db, sql) => {
            // Model Firebird rejecting the former bounded VARCHAR cast.
            if (/CAST\([^)]*RDB\$DESCRIPTION\s+AS\s+VARCHAR\(/i.test(sql)) {
                throw new Error('string right truncation');
            }
            return [
                { FIELD_NAME: 'ID', DESCRIPTION: null, FIELD_TYPE: 'INTEGER', NULLABLE: 0, PRIMARY_KEY: 1 },
                { FIELD_NAME: 'NOTE', DESCRIPTION: Buffer.from(description), FIELD_TYPE: 'VARCHAR', NULLABLE: 1, PRIMARY_KEY: 0 }
            ];
        });
        expect(await getFieldDescriptions('TEST')).toEqual([
            { name: 'ID', description: null }, { name: 'NOTE', description }
        ]);
        expect((await describeTable('TEST')).map(column => column.description)).toEqual([null, description]);
        const batch = await describeBatchTables(['TEST']);
        expect(batch[0].schema?.map(column => column.description)).toEqual([null, description]);
        expect(queryDatabase).toHaveBeenCalledTimes(3);
        for (const call of jest.mocked(queryDatabase).mock.calls) {
            expect(call[1]).toMatch(/rf\.RDB\$DESCRIPTION\s+as DESCRIPTION/i);
            expect(call[2]).toEqual(['TEST']);
        }
        expect(releaseMock).toHaveBeenCalledTimes(3);
    });

    it('resolves a streamed description before releasing the attachment', async () => {
        const description = 'long comment '.repeat(100);
        const blob = (callback: any) => {
            const stream = new EventEmitter();
            callback(null, 'DESCRIPTION', stream);
            queueMicrotask(() => {
                expect(releaseMock).not.toHaveBeenCalled();
                stream.emit('data', Buffer.from(description));
                stream.emit('end');
            });
        };
        jest.mocked(queryDatabase).mockResolvedValue([{ FIELD_NAME: 'NOTE', DESCRIPTION: blob }]);
        expect(await getFieldDescriptions('TEST')).toEqual([{ name: 'NOTE', description }]);
        expect(releaseMock).toHaveBeenCalledTimes(1);
    });

    it('retains response-size limits for full description BLOBs', async () => {
        securityConfig.resourceLimits = { maxResponseSize: 100 };
        jest.mocked(queryDatabase).mockResolvedValue([{ FIELD_NAME: 'NOTE', DESCRIPTION: Buffer.from('x'.repeat(514)) }]);
        await expect(getFieldDescriptions('TEST')).rejects.toMatchObject({ type: 'RESOURCE_LIMIT_EXCEEDED' });
        expect(releaseMock).not.toHaveBeenCalled();
        expect(destroyMock).toHaveBeenCalled();
    });

    it('retains table access checks for both description entry points', async () => {
        securityConfig.allowedTables = ['PUBLIC_DATA'];
        await expect(getFieldDescriptions('PRIVATE_DATA')).rejects.toMatchObject({ type: 'AUTHORIZATION_ERROR' });
        await expect(describeTable('PRIVATE_DATA')).rejects.toMatchObject({ type: 'AUTHORIZATION_ERROR' });
        expect(connectToDatabase).not.toHaveBeenCalled();
    });

    it.each(['pure', 'native'])('reports the unsupported %s plan honestly without executing SQL', async current => {
        jest.mocked(DriverFactory.getDriverInfo).mockResolvedValue({ current, nativeAvailable: current === 'native' } as any);
        const result = await getExecutionPlan('SELECT * FROM TEST WHERE ID = ?', [1]);
        expect(result).toMatchObject({ plan: '', planDetails: [], success: false, error: 'Execution plan not available' });
        expect(result.analysis).toContain('SET PLANONLY ON');
        expect(connectToDatabase).toHaveBeenCalledTimes(1);
        expect(queryDatabase).not.toHaveBeenCalled();
    });

    it('retains policy denial before checking driver capabilities', async () => {
        securityConfig.allowedTables = ['PUBLIC_DATA'];
        const result = await getExecutionPlan('SELECT * FROM PRIVATE_DATA');
        expect(result.success).toBe(false);
        expect(result.plan).toBe('');
        expect(result.error).not.toBe('Execution plan not available');
        expect(DriverFactory.getDriverInfo).not.toHaveBeenCalled();
        expect(queryDatabase).not.toHaveBeenCalled();
    });
});
