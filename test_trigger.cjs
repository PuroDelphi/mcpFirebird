const Firebird = require('node-firebird');
require('dotenv').config();

const options = {
    host: process.env.FIREBIRD_HOST || '127.0.0.1',
    port: parseInt(process.env.FIREBIRD_PORT || '3050', 10),
    database: process.env.FIREBIRD_DATABASE || 'F:/Proyectos/SAI/EMPLOYEE.FDB',
    user: process.env.FIREBIRD_USER || 'SYSDBA',
    password: process.env.FIREBIRD_PASSWORD || 'masterkey'
};

console.log('Connecting to:', options.database);

Firebird.attach(options, (err, db) => {
    if (err) {
        console.error('Connection error:', err);
        process.exit(1);
    }
    
    db.attachEvent(function(err, evt) {
        if (err) {
            console.error('attachEvent error:', err);
            process.exit(1);
        }
        
        evt.on('post_event', (name, count) => {
            console.log('🎉 EVENT FIRED in DB:', name, 'Count:', count);
        });

        evt.registerEvent(['TEST_EVENT_SAI'], function(err) {
            if (err) {
                console.error('Register error:', err);
                process.exit(1);
            }
            console.log('✅ Registered listener for TEST_EVENT_SAI');
            console.log('Executing POST_EVENT...');
            
            db.query("EXECUTE BLOCK AS BEGIN POST_EVENT 'TEST_EVENT_SAI'; END", (err) => {
                if (err) console.error(err);
                else console.log('✅ Query executed successfully');
                
                setTimeout(() => {
                    evt.close(() => db.detach());
                    console.log('Test completed.');
                }, 2000);
            });
        });
    });
});
