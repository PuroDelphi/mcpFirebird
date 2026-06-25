const { attach } = require('node-firebird-driver-native');
async function run() {
    try {
        const db = await attach({
            host: '127.0.0.1',
            port: 3050,
            database: 'F:/Proyectos/SAI/2024LADRILLERA SAMARITNA.FDB',
            username: 'SYSDBA',
            password: 'masterkey'
        });
        
        const tx = await db.startTransaction();
        const stmt = await db.prepare(tx, "EXECUTE BLOCK AS BEGIN POST_EVENT 'TEST_EVENT_MCP'; END");
        await stmt.execute(tx);
        await stmt.dispose();
        await tx.commit();
        await db.disconnect();
        console.log("Event fired successfully via NATIVE driver");
    } catch (e) {
        console.error(e);
    }
}
run();
