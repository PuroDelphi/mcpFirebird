const Firebird = require('node-firebird');
const options = {
    host: '127.0.0.1',
    port: 3050,
    database: 'F:/Proyectos/SAI/2024LADRILLERA SAMARITNA.FDB',
    user: 'SYSDBA',
    password: 'masterkey'
};

Firebird.attach(options, (err, db) => {
    if (err) return console.error(err);
    
    db.query("EXECUTE BLOCK AS BEGIN POST_EVENT 'TEST_EVENT_MCP'; END", (err) => {
        if (err) console.error(err);
        else console.log('Event fired successfully');
        db.detach();
    });
});
