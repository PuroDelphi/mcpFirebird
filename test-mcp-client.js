// Cliente de prueba oficial para MCP Firebird usando la SDK de MCP
import { McpClient, StdioTransport } from '@modelcontextprotocol/sdk';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener el directorio actual en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('Iniciando pruebas del servidor MCP Firebird...');

  // Iniciar el servidor MCP como un proceso hijo
  const serverProcess = spawn('node', [path.join(__dirname, 'dist', 'index.js')]);
  
  // Crear un transporte STDIO para comunicarse con el servidor
  const transport = new StdioTransport(serverProcess.stdin, serverProcess.stdout);
  
  // Crear el cliente MCP
  const client = new McpClient(transport);
  
  try {
    // Esperar a que el servidor se inicie
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n1. Probando obtención de información del servidor:');
    const serverInfo = await client.getServerInfo();
    console.log(JSON.stringify(serverInfo, null, 2));
    
    console.log('\n2. Probando listado de recursos:');
    const resources = await client.getResources();
    console.log(JSON.stringify(resources, null, 2));
    
    console.log('\n3. Probando herramienta para listar tablas:');
    const tables = await client.executeTool('list-tables', {});
    console.log(JSON.stringify(tables, null, 2));
    
    console.log('\n4. Probando herramienta para ejecutar consulta SQL:');
    const queryResult = await client.executeTool('execute-query', {
      sql: 'SELECT FIRST 5 * FROM RDB$RELATIONS'
    });
    console.log(JSON.stringify(queryResult, null, 2));
    
    console.log('\n5. Probando prompt para generar SQL:');
    const sqlGeneration = await client.executePrompt('generate-sql', {
      description: 'Obtener los primeros 10 registros de la tabla de usuarios'
    });
    console.log(JSON.stringify(sqlGeneration, null, 2));
    
  } catch (error) {
    console.error('Error durante las pruebas:', error);
  } finally {
    console.log('\nFinalizando pruebas y cerrando el servidor...');
    serverProcess.kill();
  }
}

// Capturar la salida de error del servidor
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
});

// Ejecutar las pruebas
runTests().catch(error => {
  console.error('Error en runTests:', error);
});
