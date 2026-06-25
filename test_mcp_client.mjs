import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function runTest() {
    console.log("Starting MCP Client Test...");

    // 1. Setup transport to run the local mcp-firebird server
    const transport = new StdioClientTransport({
        command: "node",
        args: ["dist/cli.js", "--use-native-driver"],
        env: {
            ...process.env,
            FIREBIRD_DATABASE: "F:\\Proyectos\\SAI\\2024LADRILLERA SAMARITNA.FDB",
            TRANSPORT_TYPE: "stdio"
        }
    });

    // 2. Create MCP Client
    const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: { resources: { subscribe: true } } }
    );

    let notificationReceived = false;

    // 3. Listen for ALL messages on the transport to catch notifications
    // We override onmessage to inspect the raw JSON-RPC messages coming from the server
    const originalOnMessage = transport.onmessage;
    transport.onmessage = (message) => {
        if (message.method === "notifications/resources/updated") {
            console.log(`\n✅ RECEIVED MCP NOTIFICATION: Resource Updated!`);
            console.log(`   URI: ${message.params?.uri}`);
            notificationReceived = true;
        }
        if (originalOnMessage) originalOnMessage.call(transport, message);
    };

    try {
        console.log("Connecting client to server...");
        await client.connect(transport);
        console.log("Connected.");

        // 4. Subscribe to the event
        console.log("\nCalling tool 'subscribe_to_event'...");
        const subResult = await client.callTool({
            name: "subscribe_to_event",
            arguments: { eventName: "TEST_EVENT_MCP" }
        });
        console.log("Subscription result:", subResult.content[0].text);

        // 5. Fire the event using execute-query
        console.log("\nFiring POST_EVENT via 'execute-query'...");
        await client.callTool({
            name: "execute-query",
            arguments: { sql: "EXECUTE BLOCK AS BEGIN POST_EVENT 'TEST_EVENT_MCP'; END" }
        });
        console.log("Query executed.");

        // 6. Wait a bit for the notification to arrive
        console.log("Waiting for notification...");
        await new Promise(resolve => setTimeout(resolve, 3000));

        if (notificationReceived) {
            console.log("\n🎉 SUCCESS: The MCP Server successfully broadcasted the POST_EVENT notification to the client!");
        } else {
            console.log("\n❌ FAILED: Did not receive the notification in time.");
        }

    } catch (error) {
        console.error("Test failed with error:", error);
    } finally {
        // Cleanup
        await transport.close();
        process.exit(notificationReceived ? 0 : 1);
    }
}

runTest();
