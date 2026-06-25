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
    
    console.log('Methods:', Object.keys(db.constructor.prototype));
    console.log('Properties:', Object.keys(db));
    
    db.detach();
});
