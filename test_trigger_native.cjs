const fbNative = require('node-firebird-driver-native');
require('dotenv').config();

async function runTest() {
    try {
        const host = process.env.FIREBIRD_HOST || '127.0.0.1';
        const port = process.env.FIREBIRD_PORT || '3050';
        const database = process.env.FIREBIRD_DATABASE || 'F:/Proyectos/SAI/EMPLOYEE.FDB';
        const user = process.env.FIREBIRD_USER || 'SYSDBA';
        const password = process.env.FIREBIRD_PASSWORD || 'masterkey';
        
        let connectionString = port && port !== '3050' ? `${host}/${port}:${database}` : `${host}:${database}`;

        console.log('Connecting to:', connectionString);

        const client = fbNative.createNativeClient(fbNative.getDefaultLibraryFilename());
        
        const attachment = await client.connect(connectionString, {
            username: user,
            password: password
        });

        console.log('✅ Connected successfully using node-firebird-driver-native');

        console.log('Subscribing to TEST_EVENT_SAI...');
        
        const events = await attachment.queueEvents(['TEST_EVENT_SAI'], async (counters) => {
            for (const [name, count] of counters) {
                console.log(`🎉 EVENT FIRED in DB: ${name} (Count: ${count})`);
            }
        });

        console.log('✅ Registered listener for TEST_EVENT_SAI');
        console.log('Executing POST_EVENT...');
        
        const transaction = await attachment.startTransaction();
        await attachment.execute(transaction, "EXECUTE BLOCK AS BEGIN POST_EVENT 'TEST_EVENT_SAI'; END");
        await transaction.commit();
        
        console.log('✅ Query executed successfully');
        
        setTimeout(async () => {
            await events.cancel();
            await attachment.disconnect();
            await client.dispose();
            console.log('Test completed.');
        }, 2000);
        
    } catch (err) {
        console.error('Error:', err);
    }
}

runTest();
