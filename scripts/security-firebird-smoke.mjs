// Opt-in integration test: creates a NEW database on a local Firebird service.
// Never attaches to an existing application database. Build before running.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import Firebird from 'node-firebird';

if (process.env.RUN_FIREBIRD_SECURITY_SMOKE !== 'true') throw new Error('Set RUN_FIREBIRD_SECURITY_SMOKE=true to create a disposable local database');
process.env.LOG_LEVEL = 'error';
process.env.USE_NATIVE_DRIVER = 'false';
const database = resolve('temp', `security-${randomUUID()}.fdb`);
const auditFile = database + '.audit.jsonl';
mkdirSync(dirname(database), {recursive:true});
assert(!existsSync(database));
const config = {host:'127.0.0.1',port:3050,database,user:process.env.FIREBIRD_TEST_USER || 'SYSDBA',password:process.env.FIREBIRD_TEST_PASSWORD || 'masterkey',pageSize:4096};
let initial;
try {
    initial = await new Promise((resolve,reject)=>Firebird.create(config,(error,db)=>error?reject(error):resolve(db)));
} catch {
    throw new Error('Could not create a disposable database on local Firebird. Set FIREBIRD_TEST_USER/PASSWORD if needed.');
}
const raw = (sql,params=[]) => new Promise((resolve,reject)=>initial.query(sql,params,(error,rows)=>error?reject(error):resolve(rows)));
const {executeQuery,listTables} = await import('../dist/db/queries.js');
const {closePool} = await import('../dist/db/connection.js');
const {securityConfig,DEFAULT_SECURITY_CONFIG} = await import('../dist/security/config.js');
const {createAuditTable} = await import('../dist/security/audit.js');
const reset = () => {
    for (const key of Object.keys(securityConfig)) delete securityConfig[key];
    Object.assign(securityConfig,structuredClone(DEFAULT_SECURITY_CONFIG));
};
try {
    const version = await raw("SELECT RDB$GET_CONTEXT('SYSTEM', 'ENGINE_VERSION') AS VERSION FROM RDB$DATABASE");
    console.log(`Integration target: local Firebird ${version[0].VERSION}`);
    await raw('CREATE TABLE PUBLIC_DATA (ID INTEGER, SSN VARCHAR(30), VISIBLE SMALLINT)');
    await raw('CREATE TABLE PRIVATE_DATA (ID INTEGER)');
    await raw('INSERT INTO PUBLIC_DATA VALUES (?, ?, ?)',[1,'private-value',1]);
    await raw('INSERT INTO PUBLIC_DATA VALUES (?, ?, ?)',[2,'hidden-row',0]);
    await raw('CREATE TABLE MY_TABLE (ID INTEGER, CREATED_AT TIMESTAMP, NAME VARCHAR(30), VISIBLE SMALLINT)');
    await raw("INSERT INTO MY_TABLE VALUES (1, TIMESTAMP '2026-09-28 12:00:00', '  abc  ', 1)");
    await raw("INSERT INTO MY_TABLE VALUES (2, TIMESTAMP '2026-08-28 12:00:00', 'hidden', 0)");
    reset();
    securityConfig.allowedTables=['MY_TABLE'];
    securityConfig.allowedOperations=['SELECT'];
    securityConfig.sql={allowSystemTables:false,allowUnsafeQueries:false};
    const reportedSql='SELECT T.ID, EXTRACT(MONTH FROM T.CREATED_AT) AS MON FROM MY_TABLE T;';
    assert.deepEqual(await executeQuery(reportedSql,[],config),[{ID:1,MON:9},{ID:2,MON:8}]);
    securityConfig.rowFilters={MY_TABLE:'VISIBLE = 1'};
    assert.deepEqual(await executeQuery(reportedSql,[],config),[{ID:1,MON:9}]);
    assert.deepEqual(await executeQuery('SELECT TRIM(BOTH FROM SUBSTRING(T.NAME FROM (1) FOR (7))) AS NAME FROM MY_TABLE T',[],config),[{NAME:'abc'}]);
    await assert.rejects(executeQuery('SELECT EXTRACT(MONTH FROM T.CREATED_AT) FROM PRIVATE_DATA T',[],config));
    reset();
    // Issue #41: execute derived sources through the real query boundary under
    // the reporter's empty-denylist policy, without disabling conservative SQL.
    Object.assign(securityConfig, {
        allowedOperations:['SELECT','EXECUTE'],
        forbiddenOperations:['DROP','TRUNCATE','ALTER','INSERT','UPDATE','DELETE','GRANT','REVOKE'],
        forbiddenTables:[],
        resourceLimits:{maxRowsPerQuery:1000,maxQueryCpuTime:30000},
        sql:{allowSystemTables:false,allowDDL:false,allowUnsafeQueries:false}
    });
    const derivedSql = 'SELECT * FROM (SELECT ID, NAME FROM MY_TABLE WHERE ID = ?) T';
    const derivedRows = await executeQuery(derivedSql,[1],config);
    assert.equal(derivedRows.length,1);
    assert.equal(derivedRows[0].ID,1);
    assert.equal(derivedRows[0].NAME.trim(),'abc');
    for (const joinCondition of ['ON C.ID = T.ID','USING (ID)']) {
        const rows = await executeQuery(`SELECT T.ID, C.I_COUNT FROM MY_TABLE T JOIN (SELECT ID, COUNT(ID) AS I_COUNT FROM PUBLIC_DATA GROUP BY ID) C ${joinCondition} ORDER BY T.ID`,[],config);
        assert.deepEqual(rows,[{ID:1,I_COUNT:1},{ID:2,I_COUNT:1}]);
    }
    assert.deepEqual(await executeQuery('SELECT * FROM /* source */ (SELECT EXTRACT(MONTH FROM CREATED_AT) AS MON FROM MY_TABLE WHERE ID = ?) T',[1],config),[{MON:9}]);
    await assert.rejects(executeQuery('SELECT * FROM (SELECT * FROM RDB$RELATIONS) R',[],config),/System table/);
    securityConfig.forbiddenTables=['PRIVATE_DATA'];
    await assert.rejects(executeQuery(derivedSql,[1],config));
    console.log('PASS: issue #41 derived sources, JOIN ON/USING, parameters, nested catalog denial and populated-denylist boundary');
    reset();
    // Default compatibility: catalog, opaque functions, stored procedures,
    // joins and long-lived sessions work without enabling advanced controls.
    delete process.env.ALLOW_RAW_SQL;
    await raw('CREATE PROCEDURE COMPAT_PROC RETURNS (ID INTEGER) AS BEGIN ID = 42; END');
    assert.equal((await executeQuery('EXECUTE PROCEDURE COMPAT_PROC',[],config))[0].ID,42);
    assert((await executeQuery("SELECT RDB$GET_CONTEXT('SYSTEM', 'ENGINE_VERSION') AS VERSION FROM RDB$DATABASE",[],config))[0].VERSION);
    assert.equal((await executeQuery('SELECT A.ID FROM PUBLIC_DATA A, PUBLIC_DATA B WHERE A.ID = B.ID',[],config)).length,2);
    for (let i=0;i<110;i++) await executeQuery('SELECT ID FROM PUBLIC_DATA',[],config);
    await assert.rejects(executeQuery('CREATE TABLE LEGACY_WRITE (ID INTEGER)',[],config));
    process.env.ALLOW_RAW_SQL='true';
    await executeQuery('CREATE TABLE LEGACY_WRITE (ID INTEGER)',[],config);
    delete process.env.ALLOW_RAW_SQL;
    securityConfig.allowedTables=['PUBLIC_DATA'];
    securityConfig.rowFilters={PUBLIC_DATA:'VISIBLE = 1'};
    securityConfig.dataMasking=[{columns:['SSN'],pattern:'^.*$',replacement:'[masked]'}];
    assert.deepEqual(await executeQuery('SELECT SSN AS OTHER FROM PUBLIC_DATA WHERE ID = ? OR 1=1',[99],config),[{OTHER:'[masked]'}]);
    assert.deepEqual(await listTables(config),['PUBLIC_DATA']);
    await assert.rejects(executeQuery('SELECT * FROM PRIVATE_DATA',[],config));
    reset();
    securityConfig.sql.allowedSystemTables=['RDB$RELATIONS'];
    assert((await executeQuery('SELECT FIRST 1 RDB$RELATION_NAME FROM RDB$RELATIONS',[],config)).length===1);
    await assert.rejects(executeQuery('SELECT * FROM MON$ATTACHMENTS',[],config));
    process.env.ALLOW_RAW_SQL='true';securityConfig.allowedOperations=['SELECT','CREATE'];securityConfig.sql.allowDDL=true;
    await executeQuery('CREATE TABLE CREATED_BY_POLICY (ID INTEGER)',[],config);
    securityConfig.sql.allowDDL=false;
    await assert.rejects(executeQuery('CREATE TABLE MUST_NOT_EXIST (ID INTEGER)',[],config));
    reset();
    // Internal audit operations use the explicitly selected disposable database.
    globalThis.MCP_FIREBIRD_CONFIG=config;
    securityConfig.audit={...DEFAULT_SECURITY_CONFIG.audit,enabled:true,destination:'both',auditFile,auditTable:'SECURITY_SMOKE_AUDIT',detailLevel:'full',logResponses:true};
    await createAuditTable();
    await executeQuery('SELECT ID FROM PUBLIC_DATA',[],config);
    const auditRows=await raw('SELECT LOG_ID FROM SECURITY_SMOKE_AUDIT');
    assert.equal(auditRows.length,2);
    assert.equal(readFileSync(auditFile,'utf8').trim().split('\n').length,2);
    console.log('PASS: issue #36 EXTRACT/SUBSTRING/TRIM, legacy compatibility and opt-in filtering, masking, visibility, catalog policy, DDL gating, database/file audit');
    reset();
    // Real pure-JS driver events, independent owners, cleanup and reattachment.
    const { createEventClient } = await import('../dist/resources/events.js');
    const eventName = `MCP_${randomUUID().replaceAll('-', '')}`;
    const uri = `firebird://events/${eventName}`;
    const receivedA = [], receivedB = [];
    const a = createEventClient(value => { receivedA.push(value); });
    const b = createEventClient(value => { receivedB.push(value); });
    const waitFor = async predicate => {
        const deadline = Date.now() + 5000;
        while (!predicate()) {
            if (Date.now() > deadline) throw new Error('Timed out waiting for a real Firebird POST_EVENT');
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    };
    try {
        await a.subscribe([eventName]);
        await b.subscribe([eventName]);
        await raw(`EXECUTE BLOCK AS BEGIN POST_EVENT '${eventName}'; END`);
        await waitFor(() => receivedA.includes(uri) && receivedB.includes(uri));
        await a.close();
        const previousA = receivedA.length, previousB = receivedB.length;
        await raw(`EXECUTE BLOCK AS BEGIN POST_EVENT '${eventName}'; END`);
        await waitFor(() => receivedB.length > previousB);
        assert.equal(receivedA.length, previousA);
        await b.close();
        const reconnected = createEventClient(value => { receivedB.push(value); });
        try {
            await reconnected.subscribe([eventName]);
            const before = receivedB.length;
            await raw(`EXECUTE BLOCK AS BEGIN POST_EVENT '${eventName}'; END`);
            await waitFor(() => receivedB.length > before);
        } finally { await reconnected.close(); }
        console.log('PASS: real POST_EVENT delivery, independent owners, disconnect cleanup and reconnect (pure-JS driver)');
    } finally { await Promise.all([a.close(), b.close()]); }
} finally {
    delete globalThis.MCP_FIREBIRD_CONFIG;
    await closePool();
    // DROP only this UUID-named disposable database, using its creation attachment.
    if (typeof initial.drop === 'function') await new Promise(resolve=>initial.drop(()=>resolve()));
    else await new Promise(resolve=>initial.detach(()=>resolve()));
    if (existsSync(auditFile)) unlinkSync(auditFile);
}
