jest.mock('../../db/driver-factory.js', () => ({ DriverFactory: {}, DriverType: {} }));
import { queryDatabase } from '../../db/connection.js';

describe('callback and async driver query completion (#38)', () => {
    it('waits for native adapter cleanup after a successful callback', async () => {
        let finish!: () => void;
        let settled = false;
        const db = { detach: jest.fn(), query: async (_sql: string, _params: any[], callback: any) => {
            callback(null, [{ ID: 1 }]);
            await new Promise<void>(resolve => { finish = resolve; });
        } };
        const pending = queryDatabase(db, 'SELECT 1').then(rows => { settled = true; return rows; });
        await Promise.resolve();
        expect(settled).toBe(false);
        finish();
        await expect(pending).resolves.toEqual([{ ID: 1 }]);
    });
    it('observes rejection from an async adapter that never invokes its callback', async () => {
        const db = { detach: jest.fn(), query: async () => { throw new Error('native failure'); } };
        await expect(queryDatabase(db, 'SELECT 1')).rejects.toThrow('native failure');
    });
    it('does not expose a successful result when async cleanup subsequently fails', async () => {
        const db = { detach: jest.fn(), query: async (_sql: string, _params: any[], callback: any) => {
            callback(null, [{ ID: 1 }]);
            throw new Error('cleanup failed');
        } };
        await expect(queryDatabase(db, 'SELECT 1')).rejects.toThrow('cleanup failed');
    });
    it('preserves synchronous callback-only drivers and procedure object results', async () => {
        const db = { detach: jest.fn(), query: (_sql: string, _params: any[], callback: any) => callback(null, { ID: 1 }) };
        await expect(queryDatabase(db, 'EXECUTE PROCEDURE P')).resolves.toEqual({ ID: 1 });
    });
});
