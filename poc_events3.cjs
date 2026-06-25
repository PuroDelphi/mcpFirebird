const Firebird = require('node-firebird');
const options = {
    host: '127.0.0.1',
    port: 3050,
    database: 'F:/Proyectos/SAI/2024LADRILLERA SAMARITNA.FDB',
    user: 'SYSDBA',
    password: 'masterkey'
};

Firebird.attach(options, (err, db) => {
    if (err) return;
    
    db.attachEvent(function(err, evt) {
        if (err) {
            console.error('attachEvent error:', err);
            return;
        }
        
        evt.on('post_event', (name, count) => {
            console.log('EVENT FIRED:', name, count);
        });

        evt.registerEvent(['TEST_EVENT'], function(err) {
            if (err) console.error('Register error:', err);
            else console.log('Registered TEST_EVENT');
            
            db.query("EXECUTE BLOCK AS BEGIN POST_EVENT 'TEST_EVENT'; END", (err) => {
                if (err) console.error(err);
                else console.log('Query done');
                
                setTimeout(() => {
                    evt.close(() => db.detach());
                }, 2000);
            });
        });
    });
});
