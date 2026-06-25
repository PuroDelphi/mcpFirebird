import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function test() {
    console.log("Starting test...");
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3003/mcp"));
    try {
        await transport.start();
        console.log("start() finished successfully!");
    } catch (e) {
        console.log("start() threw error:");
        console.error(e);
    }
}

test();
