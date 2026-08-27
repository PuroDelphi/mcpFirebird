jest.mock('../../db/queries.js', () => ({
    listTables: jest.fn(),
    describeTable: jest.fn(),
    executeQuery: jest.fn()
}));

jest.mock('../../db/schema.js', () => ({
    getTableSchema: jest.fn()
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listTables } from '../../db/queries.js';
import { getTableSchema } from '../../db/schema.js';
import { registerDatabaseResources } from '../../resources/database.js';

const mockedListTables = jest.mocked(listTables);
const mockedGetTableSchema = jest.mocked(getTableSchema);

describe('database MCP resources', () => {
    let server: McpServer;
    let client: Client;

    beforeEach(async () => {
        jest.clearAllMocks();
        server = new McpServer({ name: 'test-firebird', version: '1.0.0' });
        client = new Client({ name: 'test-client', version: '1.0.0' });
        registerDatabaseResources(server);

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        await client.connect(clientTransport);
    });

    afterEach(async () => {
        await client.close();
        await server.close();
    });

    it('lists static resources with firebird URIs', async () => {
        const response = await client.listResources();

        expect(response.resources.map(resource => resource.uri).sort()).toEqual([
            'firebird://schema',
            'firebird://statistics',
            'firebird://tables'
        ]);
    });

    it('lists parameterized resources as templates', async () => {
        const response = await client.listResourceTemplates();

        expect(response.resourceTemplates.map(resource => resource.uriTemplate).sort()).toEqual([
            'firebird://tables/{tableName}/constraints',
            'firebird://tables/{tableName}/description',
            'firebird://tables/{tableName}/indexes',
            'firebird://tables/{tableName}/schema',
            'firebird://tables/{tableName}/triggers'
        ]);
    });

    it('reads a static resource', async () => {
        mockedListTables.mockResolvedValue(['CUSTOMERS']);

        const response = await client.readResource({ uri: 'firebird://tables' });
        const content = response.contents[0];

        expect(content).toMatchObject({
            uri: 'firebird://tables',
            mimeType: 'application/json'
        });
        expect('text' in content && JSON.parse(content.text as string)).toEqual({
            tables: ['CUSTOMERS']
        });
    });

    it('passes template parameters when reading a dynamic resource', async () => {
        mockedGetTableSchema.mockResolvedValue([{ name: 'ID', type: 'INTEGER' }] as any);

        const response = await client.readResource({
            uri: 'firebird://tables/CUSTOMERS/schema'
        });
        const content = response.contents[0];

        expect(mockedGetTableSchema).toHaveBeenCalledWith('CUSTOMERS');
        expect('text' in content && JSON.parse(content.text as string)).toEqual([
            { name: 'ID', type: 'INTEGER' }
        ]);
    });
});
