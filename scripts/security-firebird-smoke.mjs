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
// Exercise the compatibility default independently of the maintainer's launcher.
delete process.env.FIREBIRD_DATE_FORMAT;
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
const {executeQuery,listTables,getFieldDescriptions,describeTable,describeBatchTables,getExecutionPlan,analyzeMissingIndexes} = await import('../dist/db/queries.js');
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
    // #44: grouping/predicate syntax through the actual policy + transaction path.
    // Window functions require Firebird 3+, so this 2.5 smoke does not execute them.
    reset();
    Object.assign(securityConfig, {
        allowedOperations: ['SELECT', 'EXECUTE'], forbiddenTables: [],
        sql: { allowSystemTables: false, allowUnsafeQueries: false }
    });
    await raw('CREATE TABLE DEPARTMENT (ID INTEGER, CODE VARCHAR(20))');
    for (const [id, code] of [[1, 'IRL'], [2, 'FR'], [3, 'I_A']]) await raw('INSERT INTO DEPARTMENT VALUES (?, ?)', [id, code]);
    const groupedQueries = [
        'SELECT FIRST 1 ID FROM DEPARTMENT ORDER BY (ID)',
        'SELECT CODE FROM DEPARTMENT GROUP BY (CODE)',
        "SELECT FIRST 1 ID FROM DEPARTMENT WHERE CODE LIKE ('I%')",
        "SELECT FIRST 1 ID FROM DEPARTMENT WHERE CODE CONTAINING ('IRL')",
        "SELECT FIRST 1 ID FROM DEPARTMENT WHERE CODE STARTING WITH ('IRL')",
        "SELECT FIRST 1 ID FROM DEPARTMENT WHERE CODE SIMILAR TO ('IRL%')",
        "SELECT ID FROM DEPARTMENT WHERE CODE NOT LIKE ('I!_%') ESCAPE ('!') ORDER BY (ID)",
        "SELECT ID FROM DEPARTMENT WHERE CODE STARTS WITH ('IRL')",
        "SELECT ID FROM DEPARTMENT WHERE CODE STARTING ('IRL')",
        'SELECT ID FROM DEPARTMENT WHERE ID IS DISTINCT FROM (1) ORDER BY (ID)',
        'SELECT ID FROM DEPARTMENT WHERE ID IS NOT DISTINCT FROM (1)',
        'SELECT FIRST (1) SKIP (0) ID FROM DEPARTMENT ORDER BY (ID)',
        'SELECT ID FROM DEPARTMENT WHERE ID BETWEEN (1) AND (2) ORDER BY (ID)',
        'SELECT CAST(ID AS DECIMAL(10, 2)) AS N FROM DEPARTMENT ORDER BY (ID)'
    ];
    for (const sql of groupedQueries) assert.deepEqual(await executeQuery(sql, [], config), await raw(sql));
    await assert.rejects(executeQuery('SELECT ID FROM DEPARTMENT ORDER BY (PRIVATE_FUNCTION(ID))', [], config), /Unrecognized SQL function/);
    await assert.rejects(executeQuery('SELECT ID FROM DEPARTMENT WHERE ID IS DISTINCT FROM (SELECT RDB$RELATION_ID FROM RDB$RELATIONS)', [], config), /System table/);
    console.log('PASS: issue #44 grouping/predicates match direct Firebird results while nested routines/catalogs remain denied');
    reset();
    // Default compatibility: catalog, opaque functions, stored procedures,
    // joins and long-lived sessions work without enabling advanced controls.
    delete process.env.ALLOW_RAW_SQL;
    await raw('CREATE PROCEDURE COMPAT_PROC RETURNS (ID INTEGER) AS BEGIN ID = 42; END');
    assert.equal((await executeQuery('EXECUTE PROCEDURE COMPAT_PROC',[],config))[0].ID,42);
    // #43: real pure-JS BLOB lifetime, LIST aggregate, dates and FB 2.5 statistics.
    await raw('CREATE TABLE BLOB_TEST (ID INTEGER, NOTE BLOB SUB_TYPE TEXT, CREATED_AT TIMESTAMP)');
    await raw("INSERT INTO BLOB_TEST VALUES (1, NULL, TIMESTAMP '2026-09-04 23:12:26.9852')");
    await raw("INSERT INTO BLOB_TEST VALUES (2, ?, NULL)", ['Türkçe İSTANBUL ŞİŞLİ ığüşöç']);
    const blobRows = await executeQuery('SELECT * FROM BLOB_TEST ORDER BY ID', [], config);
    assert.equal(blobRows[0].NOTE, null);
    assert.equal(JSON.parse(JSON.stringify(blobRows[0].CREATED_AT)), new Date(2026, 8, 4, 23, 12, 26, 985).toISOString());
    assert.equal(blobRows[1].NOTE, 'Türkçe İSTANBUL ŞİŞLİ ığüşöç');
    process.env.FIREBIRD_DATE_FORMAT = 'wall-clock';
    try {
        const localRows = await executeQuery('SELECT * FROM BLOB_TEST ORDER BY ID', [], config);
        assert.equal(localRows[0].CREATED_AT, '2026-09-04 23:12:26.985');
        assert.equal(localRows[1].NOTE, blobRows[1].NOTE);
    } finally { delete process.env.FIREBIRD_DATE_FORMAT; }
    const listRows = await executeQuery('SELECT LIST(ID) AS IDS FROM BLOB_TEST', [], config);
    assert.deepEqual(listRows[0].IDS.split(',').sort(), ['1', '2']);
    const { setupDatabaseTools } = await import('../dist/tools/database.js');
    globalThis.MCP_FIREBIRD_CONFIG = config;
    const stats = await setupDatabaseTools().get('analyze-table-statistics').handler({ tableName: 'BLOB_TEST' });
    delete globalThis.MCP_FIREBIRD_CONFIG;
    assert.equal(stats.structuredContent.success, true);
    assert.equal(stats.structuredContent.result.rowCount, 2);
    console.log('PASS: PR #43 BLOB/NULL/LIST, legacy ISO and opt-in wall-clock dates, real table statistics');
    // #45/#46: full metadata BLOBs, including a NULL first description.
    await raw('CREATE TABLE DESCRIPTION_TEST (ID INTEGER, NOTE_514 INTEGER, NOTE_LONG INTEGER)');
    const description514 = 'x'.repeat(514), descriptionLong = 'á'.repeat(10000);
    await raw(`COMMENT ON COLUMN DESCRIPTION_TEST.NOTE_514 IS '${description514}'`);
    await raw(`COMMENT ON COLUMN DESCRIPTION_TEST.NOTE_LONG IS '${descriptionLong}'`);
    await assert.rejects(raw('SELECT CAST(RDB$DESCRIPTION AS VARCHAR(500)) AS DESCRIPTION FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = ? AND RDB$FIELD_NAME = ?', ['DESCRIPTION_TEST', 'NOTE_514']), /truncation|length/i);
    const expectedDescriptions = [null, description514, descriptionLong];
    assert.deepEqual((await getFieldDescriptions('DESCRIPTION_TEST', config)).map(field => field.description), expectedDescriptions);
    assert.deepEqual((await describeTable('DESCRIPTION_TEST', config)).map(field => field.description), expectedDescriptions);
    const describedBatch = await describeBatchTables(['DESCRIPTION_TEST'], config);
    assert.deepEqual(describedBatch[0].schema.map(field => field.description), expectedDescriptions);
    // A plan request must not execute the submitted SQL, even if it has a side effect.
    await raw('CREATE SEQUENCE PLAN_ONLY_SEQ');
    const planSql = 'SELECT GEN_ID(PLAN_ONLY_SEQ, 1) AS N FROM RDB$DATABASE';
    const plan = await getExecutionPlan(planSql, [], config);
    assert.equal(plan.success, true, JSON.stringify(plan)); assert.match(plan.plan, /PLAN.*RDB\$DATABASE.*NATURAL/);
    assert.match(plan.analysis, /without execution/);
    globalThis.MCP_FIREBIRD_CONFIG = config;
    const planTool = await setupDatabaseTools().get('get-execution-plan').handler({ sql: planSql });
    delete globalThis.MCP_FIREBIRD_CONFIG;
    assert.notEqual(planTool.isError, true); assert.equal(planTool.structuredContent.success, true);
    assert.equal((await raw('SELECT GEN_ID(PLAN_ONLY_SEQ, 0) AS N FROM RDB$DATABASE'))[0].N, 0);
    await raw('CREATE TABLE INDEX_TEST (ID INTEGER PRIMARY KEY, A INTEGER, B INTEGER, C INTEGER, D INTEGER, E INTEGER)');
    await raw('CREATE UNIQUE INDEX IX_AB ON INDEX_TEST (A, B)');
    await raw('CREATE DESCENDING INDEX IX_C_DESC ON INDEX_TEST (C)');
    await raw('CREATE INDEX IX_D_INACTIVE ON INDEX_TEST (D)');
    await raw('ALTER INDEX IX_D_INACTIVE INACTIVE');
    const indexCount = async () => (await raw('SELECT COUNT(*) AS N FROM RDB$INDICES WHERE RDB$RELATION_NAME = ?', ['INDEX_TEST']))[0].N;
    const beforeIndexes = await indexCount();
    for (const sql of ['SELECT * FROM INDEX_TEST WHERE ID = ?', 'SELECT * FROM INDEX_TEST WHERE A = ? ORDER BY A, B', 'SELECT * FROM INDEX_TEST ORDER BY C DESC']) {
        const advice = await analyzeMissingIndexes(sql, config);
        assert.equal(advice.success, true, JSON.stringify(advice)); assert.deepEqual(advice.missingIndexes, []);
    }
    const inactive = await analyzeMissingIndexes('SELECT * FROM INDEX_TEST WHERE D = ?', config);
    assert.deepEqual(inactive.missingIndexes, []); assert.match(inactive.recommendations.join(' '), /inactive.*IX_D_INACTIVE/);
    const missing = await analyzeMissingIndexes('SELECT * FROM INDEX_TEST WHERE E = ?', config);
    assert.equal(missing.success, true); assert.equal(missing.missingIndexes.length, 1); assert.match(missing.missingIndexes[0], /ON "INDEX_TEST" \("E"\)/);
    const indexedPlan = await getExecutionPlan('SELECT * FROM INDEX_TEST WHERE ID = ?', [1], config);
    assert.equal(indexedPlan.success, true, JSON.stringify(indexedPlan)); assert.match(indexedPlan.plan, /INDEX \(RDB\$PRIMARY/);
    assert.equal(await indexCount(), beforeIndexes); // Suggestions are not applied.
    console.log('PASS: #45 descriptions; real prepare-only plans leave sequence unchanged; PK/composite/descending/inactive index metadata prevents duplicate DDL');
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
