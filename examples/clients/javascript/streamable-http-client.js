/**
 * MCP Firebird - Streamable HTTP Client Example (JavaScript)
 * 
 * This example demonstrates how to connect to an MCP Firebird server
 * using the modern Streamable HTTP transport.
 * 
 * Prerequisites:
 * - npm install @modelcontextprotocol/sdk
 * - MCP Firebird server running with HTTP transport on port 3012
 * 
 * Usage:
 * node streamable-http-client.js
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function main() {
    console.log('🚀 Connecting to MCP Firebird server...');

    // Create MCP client
    const client = new Client({
        name: 'firebird-example-client',
        version: '1.0.0'
    });

    // Connect using Streamable HTTP transport
    const transport = new StreamableHTTPClientTransport(
        new URL('http://localhost:3012/mcp')
    );

    try {
        await client.connect(transport);
        console.log('✅ Connected to MCP Firebird server\n');

        // List available tools
        console.log('📋 Listing available tools...');
        const toolsList = await client.listTools();
        console.log(`Found ${toolsList.tools.length} tools:`);
        toolsList.tools.forEach(tool => {
            console.log(`  - ${tool.name}: ${tool.description}`);
        });
        console.log();

        // List available prompts
        console.log('💬 Listing available prompts...');
        const promptsList = await client.listPrompts();
        console.log(`Found ${promptsList.prompts.length} prompts:`);
        promptsList.prompts.forEach(prompt => {
            console.log(`  - ${prompt.name}: ${prompt.description}`);
        });
        console.log();

        // Example: List tables
        console.log('🗂️  Listing database tables...');
        const tablesResult = await client.callTool({
            name: 'list-tables_mcp-firebird',
            arguments: {
                schemas: ['PUBLIC']
            }
        });
        console.log('Tables:', tablesResult.content[0].text);
        console.log();

        // Example: Execute a query
        console.log('🔍 Executing a sample query...');
        const queryResult = await client.callTool({
            name: 'execute-query_mcp-firebird',
            arguments: {
                query: 'SELECT FIRST 5 * FROM RDB$DATABASE'
            }
        });
        console.log('Query result:', queryResult.content[0].text);
        console.log();

        // Example: Get a prompt
        console.log('📝 Getting database-analysis prompt...');
        const prompt = await client.getPrompt({
            name: 'database-analysis',
            arguments: {
                analysisType: 'performance'
            }
        });
        console.log('Prompt messages:', prompt.messages.length);
        console.log();

        console.log('✅ All operations completed successfully!');

    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await client.close();
        console.log('👋 Connection closed');
    }
}

main().catch(console.error);

