import { Server } from "@modelcontextprotocol/sdk";
import { StdioServerTransport } from "@modelcontextprotocol/sdk";

describe('Integration Tests', () => {
    let server: Server;
    let transport: StdioServerTransport;

    beforeAll(async () => {
        server = new Server({
            name: "mcp-firebird",
            version: "1.0.64"
        }, {
            capabilities: {
                resources: {},
                tools: {},
                prompts: {}
            }
        });
        transport = new StdioServerTransport();
        await server.connect(transport);
    });

    afterAll(async () => {
        await transport.close();
    });

    it('should initialize successfully', () => {
        expect(server).toBeDefined();
    });
}); 