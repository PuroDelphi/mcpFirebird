// Cliente de prueba para el servidor MCP Firebird
// Este script se conecta al servidor MCP y prueba todas las herramientas, prompts y recursos

import { McpClient } from '@modelcontextprotocol/sdk/client/mcp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Definimos la ruta al servidor MCP
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, 'dist', 'index.js');

// Función para ejecutar pruebas en el servidor MCP
async function runTests() {
    console.log('Iniciando pruebas del servidor MCP Firebird...');
    
    // Iniciamos el proceso del servidor
    const serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Manejamos salidas de stderr para depuración
    serverProcess.stderr.on('data', (data) => {
        console.log(`[SERVER LOG] ${data.toString().trim()}`);
    });
    
    // Crear transporte y cliente MCP
    const transport = new StdioClientTransport({
        stdin: serverProcess.stdin,
        stdout: serverProcess.stdout
    });
    
    const client = new McpClient();
    
    try {
        // Conectar al servidor
        console.log('Conectando al servidor MCP...');
        await client.connect(transport);
        console.log('Conexión establecida con éxito');
        
        // Obtener información del servidor
        const serverInfo = await client.serverInfo();
        console.log(`\n===== Información del servidor =====`);
        console.log(`Nombre: ${serverInfo.name}`);
        console.log(`Versión: ${serverInfo.version}`);
        console.log(`Descripción: ${serverInfo.description}`);
        
        // 1. Probar herramientas (tools)
        console.log(`\n===== Probando herramientas =====`);
        const tools = await client.tools();
        console.log(`Herramientas disponibles: ${tools.length}`);
        
        // Listar todas las herramientas
        console.log('Listado de herramientas:');
        for (const tool of tools) {
            console.log(`- ${tool.name}: ${tool.description}`);
        }
        
        // Probar herramienta de listado de tablas si existe
        const listTablesTool = tools.find(t => t.name === 'list-tables');
        if (listTablesTool) {
            console.log(`\nProbando herramienta 'list-tables'...`);
            try {
                const result = await client.callTool('list-tables', {});
                console.log('Resultado de list-tables:');
                console.log(JSON.stringify(result, null, 2));
            } catch (error) {
                console.error(`Error al ejecutar list-tables: ${error.message}`);
            }
        }
        
        // 2. Probar prompts
        console.log(`\n===== Probando prompts =====`);
        const prompts = await client.prompts();
        console.log(`Prompts disponibles: ${prompts.length}`);
        
        // Listar todos los prompts
        console.log('Listado de prompts:');
        for (const prompt of prompts) {
            console.log(`- ${prompt.name}: ${prompt.description}`);
        }
        
        // 3. Probar recursos
        console.log(`\n===== Probando recursos =====`);
        const resources = await client.resources();
        console.log(`Recursos disponibles: ${resources.length}`);
        
        // Listar todos los recursos
        console.log('Listado de recursos:');
        for (const resource of resources) {
            console.log(`- ${resource.name}: ${resource.description}`);
            console.log(`  URI: ${resource.uri}`);
        }
        
        // Probar acceso a un recurso (databases)
        if (resources.find(r => r.name === 'databases')) {
            console.log(`\nProbando acceso al recurso 'databases'...`);
            try {
                const result = await client.getResource('databases');
                console.log('Resultado de databases:');
                console.log(JSON.stringify(result, null, 2));
            } catch (error) {
                console.error(`Error al acceder al recurso databases: ${error.message}`);
            }
        }
        
        console.log(`\n===== Pruebas completadas =====`);
    } catch (error) {
        console.error(`Error durante las pruebas: ${error.message}`);
    } finally {
        // Cerrar cliente y terminar el proceso del servidor
        await client.disconnect();
        serverProcess.kill();
        console.log('Cliente desconectado y servidor terminado');
    }
}

// Ejecutar las pruebas
runTests().catch(error => {
    console.error(`Error fatal: ${error}`);
    process.exit(1);
});
