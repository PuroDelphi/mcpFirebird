import { connect } from 'mcp-firebird';
import { testConfig, testTable, testData } from './test-config';

let mcpConnection: any;

beforeAll(async () => {
  // Conectar al MCP
  mcpConnection = await connect(testConfig);
  
  // Limpiar datos de prueba anteriores
  await mcpConnection.query({
    sql: `DELETE FROM ${testTable} WHERE ID = ?`,
    params: [testData.id]
  });
});

afterAll(async () => {
  // Limpiar datos de prueba
  await mcpConnection.query({
    sql: `DELETE FROM ${testTable} WHERE ID = ?`,
    params: [testData.id]
  });
  
  // Cerrar conexión
  await mcpConnection.disconnect();
});

export { mcpConnection }; 