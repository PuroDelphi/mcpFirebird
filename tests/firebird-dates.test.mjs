import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

for (const tz of ['UTC', 'Europe/Istanbul', 'America/Bogota', 'America/New_York']) {
    for (const mode of [undefined, '', 'iso', 'wall-clock']) {
        test(`pure-JS wire DATE/TIME/TIMESTAMP use ${mode || 'legacy default'} in ${tz}`, () => {
            const env = { ...process.env, TZ: tz, LOG_LEVEL: 'error' };
            if (mode === undefined) delete env.FIREBIRD_DATE_FORMAT;
            else env.FIREBIRD_DATE_FORMAT = mode;
            const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
                import assert from 'node:assert/strict';
                import variables from 'node-firebird/lib/wire/xsqlvar.js';
                import { queryDatabase } from './dist/db/connection.js';
                import { toolResult } from './dist/tools/contracts.js';
                const wallClock = process.env.FIREBIRD_DATE_FORMAT === 'wall-clock';
                for (const month of [0, 8]) {
                    const day = Date.UTC(2026, month, 4) / 86400000 + 40587;
                    const time = ((23 * 3600 + 12 * 60 + 26) * 1000 + 985) * 10 + 2;
                    const stamp = new variables.SQLVarTimeStamp().decode({ readInt: () => day, readUInt: () => time }, false);
                    const date = new variables.SQLVarDate().decode({ readInt: () => day }, false);
                    const clock = new variables.SQLVarTime().decode({ readUInt: () => time }, false);
                    let queries = 0, commits = 0;
                    const tx = { query(_sql, _params, cb) { queries++; cb(null, [{ STAMP: stamp, DAY: date, CLOCK: clock, EMPTY: null }]); }, commit(cb) { commits++; cb(null); }, rollback(cb) { cb(null); } };
                    const db = { transaction(_mode, cb) { cb(null, tx); } };
                    const rows = await queryDatabase(db, 'SELECT STAMP, DAY, CLOCK FROM T');
                    assert.equal(queries, 1); assert.equal(commits, 1);
                    const prefix = '2026-' + String(month + 1).padStart(2, '0') + '-04';
                    const expected = wallClock
                        ? { STAMP: prefix + ' 23:12:26.985', DAY: prefix + ' 00:00:00.000', CLOCK: '1970-01-01 23:12:26.985', EMPTY: null }
                        : JSON.parse(JSON.stringify({ STAMP: stamp, DAY: date, CLOCK: clock, EMPTY: null }));
                    if (!wallClock) { assert.equal(rows[0].STAMP, stamp); assert.equal(rows[0].DAY, date); assert.equal(rows[0].CLOCK, clock); }
                    const output = toolResult(rows);
                    assert.deepEqual(output.structuredContent.result, [expected]);
                    assert.deepEqual(JSON.parse(output.content[0].text), [expected]);
                }
                const original = new Date('2026-09-04T20:12:26.985Z');
                const native = { query: async (_sql, _params, cb) => cb(null, [{ VALUE: original }]), detach() {} };
                const rows = await queryDatabase(native, 'SELECT VALUE FROM T');
                assert.equal(rows[0].VALUE, original);
                assert.equal(toolResult(rows).structuredContent.result[0].VALUE, original.toISOString());
                assert.equal(toolResult({ genericDate: original }).structuredContent.result.genericDate, original.toISOString());
            `], { env, encoding: 'utf8', timeout: 15000 });
            assert.equal(result.status, 0, result.stderr || result.stdout);
        });
    }
}
