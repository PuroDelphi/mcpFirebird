// Ejemplo de uso del MCP con Claude Desktop
const { connect } = require('mcp-firebird');

async function main() {
    try {
        // Conectar al MCP
        console.log('Conectando al MCP...');
        const mcp = await connect('mcp-firebird://localhost:3001');
        console.log('Conexión establecida');

        // Ejemplo 1: Consulta simple
        console.log('\nEjecutando consulta simple...');
        const result = await mcp.query({
            sql: 'SELECT * FROM RBA_GLOBAL_SETTING WHERE ID = ?',
            params: [1]
        });
        console.log('Resultado:', result);

        // Ejemplo 2: Análisis de estructura
        console.log('\nAnalizando estructura de tabla...');
        const tableInfo = await mcp.analyze({
            type: 'table_structure',
            table: 'RBA_GLOBAL_SETTING',
            options: {
                includeIndexes: true,
                includeConstraints: true
            }
        });
        console.log('Información de tabla:', tableInfo);

        // Ejemplo 3: Análisis de tendencias
        console.log('\nAnalizando tendencias...');
        const trends = await mcp.analyze({
            type: 'data_trends',
            table: 'RBA_GLOBAL_SETTING',
            options: {
                field: 'VALUE',
                period: 'monthly'
            }
        });
        console.log('Tendencias:', trends);

        // Ejemplo 4: Operaciones CRUD
        console.log('\nEjecutando operaciones CRUD...');
        
        // Insertar
        await mcp.query({
            sql: 'INSERT INTO RBA_GLOBAL_SETTING (ID, NAME, VALUE) VALUES (?, ?, ?)',
            params: [100, 'TEST_SETTING', 'test_value']
        });
        console.log('Registro insertado');

        // Leer
        const inserted = await mcp.query({
            sql: 'SELECT * FROM RBA_GLOBAL_SETTING WHERE ID = ?',
            params: [100]
        });
        console.log('Registro leído:', inserted);

        // Actualizar
        await mcp.query({
            sql: 'UPDATE RBA_GLOBAL_SETTING SET VALUE = ? WHERE ID = ?',
            params: ['updated_value', 100]
        });
        console.log('Registro actualizado');

        // Eliminar
        await mcp.query({
            sql: 'DELETE FROM RBA_GLOBAL_SETTING WHERE ID = ?',
            params: [100]
        });
        console.log('Registro eliminado');

        // Cerrar conexión
        await mcp.disconnect();
        console.log('\nConexión cerrada');

    } catch (error) {
        console.error('Error:', error);
    }
}

main(); 