import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const tz of ['UTC', 'Europe/Istanbul', 'America/Bogota', 'America/New_York']) {
    test(`pure-JS wire dates retain wall clock in ${tz}`, () => {
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
            import assert from 'node:assert/strict';
            import variables from 'node-firebird/lib/wire/xsqlvar.js';
            import { normalizePureJsDates, queryDatabase } from './dist/db/connection.js';
            import { toolResult } from './dist/tools/contracts.js';
            for (const month of [0, 8]) {
                const day = Date.UTC(2026, month, 4) / 86400000 + 40587;
                const time = ((23 * 3600 + 12 * 60 + 26) * 1000 + 985) * 10 + 2;
                const stamp = new variables.SQLVarTimeStamp().decode({ readInt: () => day, readUInt: () => time }, false);
                const date = new variables.SQLVarDate().decode({ readInt: () => day }, false);
                const normalized = normalizePureJsDates([{ STAMP: stamp, DAY: date, EMPTY: null }])[0];
                const prefix = '2026-' + String(month + 1).padStart(2, '0') + '-04';
                assert.equal(normalized.STAMP, prefix + ' 23:12:26.985');
                assert.equal(normalized.DAY, prefix + ' 00:00:00.000');
                assert.equal(normalized.EMPTY, null);
            }
            const original = new Date('2026-09-04T20:12:26.985Z');
            const db = { query: async (_sql, _params, cb) => cb(null, [{ VALUE: original }]), detach() {} };
            const rows = await queryDatabase(db, 'SELECT VALUE FROM T');
            assert.equal(rows[0].VALUE, original); // Do not reinterpret the native adapter.
            assert.equal(toolResult(rows).structuredContent.result[0].VALUE, original.toISOString());
        `], { env: { ...process.env, TZ: tz, LOG_LEVEL: 'error' }, encoding: 'utf8', timeout: 15000 });
        assert.equal(result.status, 0, result.stderr || result.stdout);
    });
}
