import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ResourceUpdatedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

async function runTest() {
    console.log("Starting MCP Streamable HTTP Client Test...");

    const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3003/mcp"));

    const client = new Client(
        { name: "test-streamable-client", version: "1.0.0" },
        { capabilities: {} }
    );

    try {
        console.log("Connecting client to Streamable HTTP server...");
        await client.connect(transport);
        console.log("Connected.");

        console.log("Subscribing to event 'TEST_EVENT_MCP'...");
        await client.callTool({
            name: "subscribe_to_event",
            arguments: { eventName: "TEST_EVENT_MCP" }
        });
        
        let received = false;
        client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
            console.log("\n✅ RECEIVED MCP NOTIFICATION: Resource Updated!");
            console.log(`   URI: ${notification.params.uri}`);
            received = true;
        });
        
        console.log("Firing event via execute-query...");
        await client.callTool({
            name: "execute-query",
            arguments: { sql: "EXECUTE BLOCK AS BEGIN POST_EVENT 'TEST_EVENT_MCP'; END" }
        });
        
        console.log("Waiting for notification (max 5s)...");
        let attempts = 0;
        while (!received && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (received) {
            console.log("\n🎉 SUCCESS: Streamable HTTP transport works perfectly!");
        } else {
            console.log("\n❌ FAILED: Did not receive the notification in time.");
            process.exit(1);
        }

    } catch (error) {
        console.error("Error during test:", error);
    } finally {
        transport.close();
        process.exit(0);
    }
}

runTest().catch(console.error);
