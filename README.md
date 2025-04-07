# MCP Firebird

Implementation of Anthropic's MCP protocol for Firebird databases.

## What is MCP Firebird and what is it for?

MCP Firebird is a server that implements Anthropic's [Model Context Protocol (MCP)](https://github.com/anthropics/anthropic-cookbook/tree/main/model_context_protocol) for [Firebird SQL databases](https://firebirdsql.org/). It allows Large Language Models (LLMs) like Claude to access, analyze, and manipulate data in Firebird databases securely and in a controlled manner.

You'll find use cases and examples below.

## Installation

```bash
# Global installation
npm install -g mcp-firebird

# Project installation
npm install mcp-firebird
```

## Configuration

### Environment Variables

You can configure the server using environment variables:

```bash
# Basic configuration
export FIREBIRD_HOST=localhost
export FIREBIRD_PORT=3050
export FIREBIRD_DATABASE=/path/to/database.fdb
export FIREBIRD_USER=SYSDBA
export FIREBIRD_PASSWORD=masterkey
export FIREBIRD_ROLE=undefined  # Optional

# Directory configuration (alternative)
export FIREBIRD_DATABASE_DIR=/path/to/databases  # Directory with databases

# Logging configuration
export LOG_LEVEL=info  # Options: debug, info, warn, error
```

You can create a `.env` file in the project root to set these variables. A `.env.example` file is provided as a template.

### Example .env file

```
FIREBIRD_HOST=localhost
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=F:\Proyectos\SAI\EMPLOYEE.FDB
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=masterkey
LOG_LEVEL=info
```

### Using with npx

You can run the server directly with npx:

```bash
npx mcp-firebird --host localhost --port 3050 --database /path/to/database.fdb --user SYSDBA --password masterkey
```

### Using SSE (Server-Sent Events) transport

The MCP Firebird server also supports SSE transport, which allows clients to connect over HTTP:

```bash
# Set the transport type to SSE in your .env file
TRANSPORT_TYPE=sse
SSE_PORT=3003

# Run the server with SSE transport
npm run sse
```

You can then connect to the server using the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector http://localhost:3003
```

Or use the provided script:

```bash
npm run inspector-sse
```

#### SSE Client Examples

We provide several example clients that demonstrate how to connect to the MCP Firebird server using SSE:

- **HTML/JavaScript**: See `examples/sse-client.html` for a browser-based client
- **Node.js**: See `examples/sse-client.js` for a Node.js client
- **Python**: See `examples/sse_client.py` for a Python client

For detailed documentation on using the SSE transport, see `docs/sse-examples.md`.

## Configuration with Claude Desktop

To use the Firebird MCP server with Claude Desktop:

<Tabs>
  <Tab title="MacOS/Linux">
    ```bash
    code ~/Library/Application\ Support/Claude/claude_desktop_config.json
    ```
  </Tab>
  <Tab title="Windows">
    ```powershell
    code $env:AppData\Claude\claude_desktop_config.json
    ```
  </Tab>
</Tabs>

Add the following configuration:

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird",
        "--host",
        "localhost",
        "--port",
        "3050",
        "--database",
        "C:\\Databases\\example.fdb",
        "--user",
        "SYSDBA",
        "--password",
        "masterkey"
      ],
      "type": "stdio"
    }
  }
}
```

<Warning>
  Make sure to use absolute paths in the configuration.
</Warning>

<Note>
  The `"type": "stdio"` parameter is important as it specifies the communication method between Claude Desktop and the MCP server. This should match the `TRANSPORT_TYPE` setting in your server configuration.
</Note>

<Note>
  After saving the file, you need to restart Claude Desktop completely.
</Note>

## Resources and Features

The MCP Firebird server offers:

- **Databases**: List of all available databases
- **Tables**: List of all tables in the database
- **Views**: List of all views in the database
- **Stored procedures**: Access to procedures in the database
- **Table schemas**: Detailed structure of each table
- **Data**: Access to table data
- **Performance analysis**: Analyze query execution time and performance metrics
- **Execution plan analysis**: Get and analyze SQL execution plans
- **Index recommendations**: Identify missing indexes that could improve performance
- **Database backup and restore**: Create and restore database backups
- **Database validation**: Check database integrity and fix errors
- **Enhanced security options**: Data masking, audit logging, and resource limits

## Available Tools

1. **list-tables**: Lists all tables in the database
   ```json
   {}  // No parameters required
   ```

2. **describe-table**: Describes the structure of a table
   ```json
   {
     "tableName": "EMPLOYEES"
   }
   ```

3. **execute-query**: Executes an SQL query in the database
   ```json
   {
     "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10",
     "params": []  // Optional parameters for prepared queries
   }
   ```

4. **get-field-descriptions**: Gets field descriptions
   ```json
   {
     "tableName": "EMPLOYEES"
   }
   ```

5. **analyze-query-performance**: Analyzes the performance of a SQL query
   ```json
   {
     "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10",
     "params": [],  // Optional parameters for prepared queries
     "iterations": 3  // Optional number of iterations for averaging (default: 3)
   }
   ```

6. **get-execution-plan**: Gets the execution plan for a SQL query
   ```json
   {
     "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10",
     "params": []  // Optional parameters for prepared queries
   }
   ```

7. **analyze-missing-indexes**: Analyzes a SQL query to identify missing indexes
   ```json
   {
     "sql": "SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10"
   }
   ```

8. **backup-database**: Creates a backup of the Firebird database
   ```json
   {
     "backupPath": "C:\\backups\\mydb_backup.fbk",
     "options": {
       "format": "gbak",  // "gbak" (full backup) or "nbackup" (incremental)
       "compress": true,  // Whether to compress the backup
       "metadata_only": false,  // Whether to backup only metadata (no data)
       "verbose": true  // Whether to show detailed progress
     }
   }
   ```

9. **restore-database**: Restores a Firebird database from a backup
   ```json
   {
     "backupPath": "C:\\backups\\mydb_backup.fbk",
     "targetPath": "C:\\databases\\restored_db.fdb",
     "options": {
       "replace": true,  // Whether to replace the target database if it exists
       "pageSize": 4096,  // Page size for the restored database
       "verbose": true  // Whether to show detailed progress
     }
   }
   ```

10. **validate-database**: Validates the integrity of the Firebird database
    ```json
    {
      "options": {
        "checkData": true,  // Whether to validate data integrity
        "checkIndexes": true,  // Whether to validate indexes
        "fixErrors": false,  // Whether to attempt to fix errors
        "verbose": true  // Whether to show detailed progress
      }
    }
    ```

The **get-field-descriptions** tool is especially useful for AI models, as it retrieves comments from Firebird's RDB$DESCRIPTION metadata, providing additional semantic context about the purpose of each field.

The performance analysis tools (**analyze-query-performance**, **get-execution-plan**, and **analyze-missing-indexes**) help optimize database queries by providing insights into execution time, execution plans, and index recommendations.

The database management tools (**backup-database**, **restore-database**, and **validate-database**) provide functionality for database maintenance and disaster recovery.

## Available Prompts

1. **query-data**: Query data using natural language
   ```
   Find all employees in the sales department hired in 2023
   ```

2. **analyze-table**: Analyze the structure of a table
   ```
   Analyze the EMPLOYEES table and explain its structure
   ```

3. **optimize-query**: Optimize an SQL query
   ```
   Optimize: SELECT * FROM EMPLOYEES WHERE LAST_NAME = 'Smith'
   ```

4. **generate-sql**: Generate SQL from a description
   ```
   Generate a query to get the 10 best-selling products
   ```

## Usage from Different Languages

### TypeScript/JavaScript

```typescript
// Example with TypeScript
import { McpClient, ChildProcessTransport } from '@modelcontextprotocol/sdk';
import { spawn } from 'child_process';

async function main() {
  // Start the MCP server process
  const serverProcess = spawn('npx', [
    'mcp-firebird',
    '--database', '/path/to/database.fdb',
    '--user', 'SYSDBA',
    '--password', 'masterkey'
  ]);

  // Create a transport and an MCP client
  const transport = new ChildProcessTransport(serverProcess);
  const client = new McpClient(transport);

  try {
    // Get server information
    const serverInfo = await client.getServerInfo();
    console.log('MCP Server:', serverInfo);

    // List available tables
    const tablesResult = await client.executeTool('list-tables', {});
    console.log('Available tables:', tablesResult);

    // Execute an SQL query
    const queryResult = await client.executeTool('execute-query', {
      sql: 'SELECT FIRST 10 * FROM EMPLOYEES'
    });
    console.log('Query results:', queryResult);

    // Use a prompt to generate SQL
    const sqlGeneration = await client.executePrompt('generate-sql', {
      description: 'Get all premium customers'
    });
    console.log('Generated SQL:', sqlGeneration);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close the server process
    serverProcess.kill();
  }
}

main().catch(console.error);
```

### Python

```python
# Example with Python
import json
import subprocess
from subprocess import PIPE

class McpFirebirdClient:
    def __init__(self, database_path, user='SYSDBA', password='masterkey'):
        # Start the MCP server process
        self.process = subprocess.Popen(
            ['npx', 'mcp-firebird', '--database', database_path, '--user', user, '--password', password],
            stdin=PIPE,
            stdout=PIPE,
            stderr=PIPE,
            text=True,
            bufsize=1
        )

    def send_request(self, method, params={}):
        request = {
            'id': 1,
            'method': method,
            'params': params
        }
        # Send the request to the server
        self.process.stdin.write(json.dumps(request) + '\n')
        self.process.stdin.flush()

        # Read the response
        response_line = self.process.stdout.readline()
        while not response_line.strip() or response_line.startswith('['):
            response_line = self.process.stdout.readline()

        # Parse and return the JSON response
        return json.loads(response_line)

    def get_server_info(self):
        return self.send_request('getServerInfo')

    def list_tables(self):
        return self.send_request('executeTool', {'name': 'list-tables', 'args': {}})

    def execute_query(self, sql, params=[]):
        return self.send_request('executeTool', {
            'name': 'execute-query',
            'args': {'sql': sql, 'params': params}
        })

    def generate_sql(self, description):
        return self.send_request('executePrompt', {
            'name': 'generate-sql',
            'args': {'description': description}
        })

    def close(self):
        self.process.terminate()

# Client usage
client = McpFirebirdClient('/path/to/database.fdb')
try:
    # Get server information
    server_info = client.get_server_info()
    print(f"MCP Server: {server_info}")

    # List tables
    tables = client.list_tables()
    print(f"Available tables: {tables}")

    # Execute a query
    results = client.execute_query("SELECT FIRST 10 * FROM EMPLOYEES")
    print(f"Results: {results}")

    # Generate SQL
    sql = client.generate_sql("List the best-selling products")
    print(f"Generated SQL: {sql}")
finally:
    client.close()
```

### Delphi and Lazurus

```delphi
// Example with Delphi
program McpFirebirdClient;

{$APPTYPE CONSOLE}

uses
  System.SysUtils, System.Classes, System.JSON, System.Net.HttpClient,
  System.Diagnostics, System.IOUtils;

type
  TMcpFirebirdClient = class
  private
    FProcess: TProcess; //For Delphi change to TProcessDelphi and add https://github.com/ferruhkoroglu/TProcessDelphi
    FRequestId: Integer;

    function SendRequest(const Method: string; const Params: TJSONObject = nil): TJSONObject;
    function ReadResponse: string;
  public
    constructor Create(const DatabasePath, User, Password: string);
    destructor Destroy; override;

    function GetServerInfo: TJSONObject;
    function ListTables: TJSONObject;
    function ExecuteQuery(const SQL: string; Params: TArray<Variant> = nil): TJSONObject;
    function GenerateSQL(const Description: string): TJSONObject;
  end;

constructor TMcpFirebirdClient.Create(const DatabasePath, User, Password: string);
begin
  inherited Create;
  FRequestId := 1;

  // Create and configure the process
  FProcess := TProcess.Create(nil);
  FProcess.Executable := 'npx';
  FProcess.Parameters.Add('mcp-firebird');
  FProcess.Parameters.Add('--database');
  FProcess.Parameters.Add(DatabasePath);
  FProcess.Parameters.Add('--user');
  FProcess.Parameters.Add(User);
  FProcess.Parameters.Add('--password');
  FProcess.Parameters.Add(Password);

  FProcess.Options := [poUsePipes, poStderrToOutPut];
  FProcess.Execute;

  // Wait for the server to start
  Sleep(2000);
end;

destructor TMcpFirebirdClient.Destroy;
begin
  FProcess.Free;
  inherited;
end;

function TMcpFirebirdClient.SendRequest(const Method: string; const Params: TJSONObject = nil): TJSONObject;
var
  Request: TJSONObject;
  RequestStr, ResponseStr: string;
begin
  // Create the JSON request
  Request := TJSONObject.Create;
  try
    Request.AddPair('id', TJSONNumber.Create(FRequestId));
    Inc(FRequestId);
    Request.AddPair('method', Method);

    if Assigned(Params) then
      Request.AddPair('params', Params)
    else
      Request.AddPair('params', TJSONObject.Create);

    RequestStr := Request.ToString + #10;

    // Send the request to the process
    FProcess.Input.Write(RequestStr[1], Length(RequestStr) * 2);

    // Read the response
    ResponseStr := ReadResponse;
    Result := TJSONObject.ParseJSONValue(ResponseStr) as TJSONObject;
  finally
    Request.Free;
  end;
end;

function TMcpFirebirdClient.ReadResponse: string;
var
  Buffer: TBytes;
  BytesRead: Integer;
  ResponseStr: string;
begin
  SetLength(Buffer, 4096);
  ResponseStr := '';

  repeat
    BytesRead := FProcess.Output.Read(Buffer[0], Length(Buffer));
    if BytesRead > 0 then
    begin
      SetLength(Buffer, BytesRead);
      ResponseStr := ResponseStr + TEncoding.UTF8.GetString(Buffer);
    end;
  until BytesRead = 0;

  Result := ResponseStr;
end;

function TMcpFirebirdClient.GetServerInfo: TJSONObject;
begin
  Result := SendRequest('getServerInfo');
end;

function TMcpFirebirdClient.ListTables: TJSONObject;
var
  Params: TJSONObject;
begin
  Params := TJSONObject.Create;
  try
    Params.AddPair('name', 'list-tables');
    Params.AddPair('args', TJSONObject.Create);
    Result := SendRequest('executeTool', Params);
  finally
    Params.Free;
  end;
end;

function TMcpFirebirdClient.ExecuteQuery(const SQL: string; Params: TArray<Variant> = nil): TJSONObject;
var
  RequestParams, Args: TJSONObject;
  ParamsArray: TJSONArray;
  I: Integer;
begin
  RequestParams := TJSONObject.Create;
  Args := TJSONObject.Create;
  ParamsArray := TJSONArray.Create;

  try
    // Configure the arguments
    Args.AddPair('sql', SQL);

    if Length(Params) > 0 then
    begin
      for I := 0 to Length(Params) - 1 do
      begin
        case VarType(Params[I]) of
          varInteger: ParamsArray.Add(TJSONNumber.Create(Integer(Params[I])));
          varDouble: ParamsArray.Add(TJSONNumber.Create(Double(Params[I])));
          varBoolean: ParamsArray.Add(TJSONBool.Create(Boolean(Params[I])));
          else ParamsArray.Add(String(Params[I]));
        end;
      end;
    end;

    Args.AddPair('params', ParamsArray);
    RequestParams.AddPair('name', 'execute-query');
    RequestParams.AddPair('args', Args);

    Result := SendRequest('executeTool', RequestParams);
  finally
    RequestParams.Free;
  end;
end;

function TMcpFirebirdClient.GenerateSQL(const Description: string): TJSONObject;
var
  RequestParams, Args: TJSONObject;
begin
  RequestParams := TJSONObject.Create;
  Args := TJSONObject.Create;

  try
    Args.AddPair('description', Description);
    RequestParams.AddPair('name', 'generate-sql');
    RequestParams.AddPair('args', Args);

    Result := SendRequest('executePrompt', RequestParams);
  finally
    RequestParams.Free;
  end;
end;

var
  Client: TMcpFirebirdClient;
  ServerInfo, Tables, QueryResults, GeneratedSQL: TJSONObject;

begin
  try
    WriteLn('Starting MCP Firebird client...');

    // Create the client
    Client := TMcpFirebirdClient.Create('C:\Databases\example.fdb', 'SYSDBA', 'masterkey');
    try
      // Get server information
      ServerInfo := Client.GetServerInfo;
      WriteLn('Server information: ', ServerInfo.ToString);

      // List tables
      Tables := Client.ListTables;
      WriteLn('Available tables: ', Tables.ToString);

      // Execute a query
      QueryResults := Client.ExecuteQuery('SELECT FIRST 10 * FROM EMPLOYEES');
      WriteLn('Query results: ', QueryResults.ToString);

      // Generate SQL
      GeneratedSQL := Client.GenerateSQL('Get all premium customers');
      WriteLn('Generated SQL: ', GeneratedSQL.ToString);
    finally
      Client.Free;
    end;
  except
    on E: Exception do
      WriteLn('Error: ', E.Message);
  end;

  WriteLn('Press ENTER to exit...');
  ReadLn;
end.
```

## Docker Configuration

You can run the MCP Firebird server in a Docker container with support for both STDIO and SSE transports:

### Dockerfile

```dockerfile
FROM node:20-alpine

# Install necessary dependencies for Firebird
RUN apk add --no-cache firebird-client

# Create application directory
WORKDIR /app

# Copy project files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src/ ./src/
COPY run-sse-server.js ./
COPY run-sse-proxy.js ./
COPY run-inspector.cjs ./
COPY run-inspector.js ./

# Compile the TypeScript project
RUN npm run build

# Expose port for SSE transport
EXPOSE 3003

# Set default environment variables
ENV FIREBIRD_HOST=firebird-db
ENV FIREBIRD_PORT=3050
ENV FIREBIRD_USER=SYSDBA
ENV FIREBIRD_PASSWORD=masterkey
ENV FIREBIRD_DATABASE=/firebird/data/database.fdb
ENV TRANSPORT_TYPE=stdio
ENV SSE_PORT=3003
ENV LOG_LEVEL=info

# Start command
CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  # Firebird database server
  firebird-db:
    image: jacobalberty/firebird:3.0
    environment:
      ISC_PASSWORD: masterkey
      FIREBIRD_DATABASE: database.fdb
      FIREBIRD_USER: SYSDBA
    volumes:
      - firebird-data:/firebird/data
    ports:
      - "3050:3050"
    networks:
      - mcp-network

  # MCP Firebird server with STDIO transport (for Claude Desktop)
  mcp-firebird-stdio:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      FIREBIRD_HOST: firebird-db
      FIREBIRD_PORT: 3050
      FIREBIRD_USER: SYSDBA
      FIREBIRD_PASSWORD: masterkey
      FIREBIRD_DATABASE: /firebird/data/database.fdb
      TRANSPORT_TYPE: stdio
    depends_on:
      - firebird-db
    networks:
      - mcp-network
    # For use with Claude Desktop, expose STDIO
    stdin_open: true
    tty: true

  # MCP Firebird server with SSE transport (for web clients)
  mcp-firebird-sse:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      FIREBIRD_HOST: firebird-db
      FIREBIRD_PORT: 3050
      FIREBIRD_USER: SYSDBA
      FIREBIRD_PASSWORD: masterkey
      FIREBIRD_DATABASE: /firebird/data/database.fdb
      TRANSPORT_TYPE: sse
      SSE_PORT: 3003
    ports:
      - "3003:3003"
    depends_on:
      - firebird-db
    networks:
      - mcp-network
    command: node run-sse-server.js

  # SSE Proxy (optional, for clients that need proxy support)
  mcp-sse-proxy:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      MCP_SERVER_URL: http://mcp-firebird-sse:3003
      PORT: 3005
    ports:
      - "3005:3005"
    depends_on:
      - mcp-firebird-sse
    networks:
      - mcp-network
    command: node run-sse-proxy.js

networks:
  mcp-network:
    driver: bridge

volumes:
  firebird-data:
```

### Running with Docker

```bash
# Build and run with Docker Compose
docker compose up -d

# Run only the STDIO version (for Claude Desktop)
docker compose up -d mcp-firebird-stdio

# Run only the SSE version (for web clients)
docker compose up -d mcp-firebird-sse

# Run the SSE version with proxy (for clients that need proxy support)
docker compose up -d mcp-firebird-sse mcp-sse-proxy

# Check logs
docker compose logs -f mcp-firebird-sse

# Stop services
docker compose down
```

### Connecting to the Dockerized MCP Server

#### With Claude Desktop

Update your Claude Desktop configuration to use the Docker container:

```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "docker",
      "args": [
        "exec",
        "-i",
        "mcp-firebird-stdio",
        "node",
        "dist/index.js"
      ],
      "type": "stdio"
    }
  }
}
```

#### With Web Clients

Connect to the SSE endpoint at `http://localhost:3003` or through the proxy at `http://localhost:3005`.

#### With MCP Inspector

```bash
# Connect directly to the SSE server
npx @modelcontextprotocol/inspector http://localhost:3003

# Or connect through the proxy
npx @modelcontextprotocol/inspector http://localhost:3005
```

## Recent Updates

### Version 2.0.5

MCP Firebird has been significantly enhanced with:

- **SSE Transport Support**: Added robust Server-Sent Events (SSE) transport implementation
- **Proxy Support**: Added support for connecting through an SSE proxy
- **Multi-Transport Architecture**: Support for both STDIO and SSE transports
- **Enhanced Security**: Improved security options and configuration
- **Docker Support**: Updated Docker configuration for all transport types

### Version 1.0.93 (Previous stable version)

MCP Firebird has been significantly improved with:

1. **Enhanced TypeScript interfaces**:
   - New interfaces for better type safety (FirebirdDatabase, ConfigOptions, DatabaseInfo, TableInfo, etc.)
   - Stricter typing for all parameters and return values

2. **Improved error handling**:
   - Custom `FirebirdError` class for better error categorization
   - Detailed detection of different error types (connection, syntax, permissions, etc.)
   - More informative error messages for easier debugging

3. **New features and tools**:
   - `get-methods` tool for API discovery
   - New prompts for analyzing tables and optimizing queries
   - `describeTable` function for detailed table structure
   - `listTables` function for simple table name listing

4. **Better documentation**:
   - Comprehensive JSDoc for all functions
   - Improved MCP tool descriptions with Firebird-specific information
   - Clear specification that Firebird uses FIRST/ROWS instead of LIMIT for pagination

5. **Security improvements**:
   - Explicit SQL parameter validation
   - Enhanced SQL injection prevention
   - Configurable access restrictions for tables and operations

6. **Code quality**:
   - Removal of unnecessary files (server.js, server.new.js, test-*.js, etc.)
   - More compact JSON responses (removed unnecessary spaces)
   - Consistent logging approach

## Use Cases

1. **Data Analysis with AI**:
   - Analyze historical sales trends
   - Identify patterns in financial data
   - Detect anomalies in transaction records

2. **SQL Query Generation**:
   - Create complex queries from natural language descriptions
   - Optimize existing queries to improve performance
   - Translate queries between different SQL dialects

3. **Automated Documentation**:
   - Generate documentation about database structure
   - Explain relationships between tables and schemas
   - Create detailed data dictionaries

4. **Development Assistance**:
   - Suggest indexes to improve performance
   - Propose schema normalizations
   - Help with data migration between systems

## Example of Sales Analysis Usage

Interaction with Claude:

```
User: Connect to my Firebird database and analyze sales trends by region in the last quarter.

Claude: I'll connect to your Firebird database to analyze regional sales trends.

[Claude uses MCP Firebird to execute several SQL queries]

Based on data from the last quarter, I've identified the following trends:

1. The North region has experienced 12.5% growth compared to the previous quarter
2. The South region shows a 3.2% decrease in electronics products
3. The "Laptop Pro X" product is the best-selling across all regions
4. Sales in the East region show a cyclical pattern with peaks on weekends

Graphically, the distribution of sales by region is:
[Graph generated by Claude based on the data]

Would you like to delve deeper into any specific region or product category?
```

## Example of Query Optimization and Performance Analysis

```
User: I have this query that's running slowly, can you optimize it?
SELECT c.CUSTOMER_NAME, SUM(o.ORDER_TOTAL)
FROM CUSTOMERS c
JOIN ORDERS o ON c.CUSTOMER_ID = o.CUSTOMER_ID
WHERE o.ORDER_DATE > '2024-01-01'
GROUP BY c.CUSTOMER_NAME
ORDER BY SUM(o.ORDER_TOTAL) DESC

Claude: I'll analyze this query to optimize it. First, let me check the execution plan and performance.

[Claude uses MCP Firebird's get-execution-plan tool]

The execution plan shows:
- Full table scan on ORDERS table
- Nested loop join with CUSTOMERS
- Sorting operation for ORDER BY clause
- No indexes being used for the date filtering

[Claude uses MCP Firebird's analyze-query-performance tool]

Performance analysis:
- Average execution time: 1250ms
- Minimum execution time: 1150ms
- Maximum execution time: 1380ms
- Rows returned: 487

[Claude uses MCP Firebird's analyze-missing-indexes tool]

Missing index analysis recommends:
- CREATE INDEX IDX_ORDERS_ORDER_DATE ON ORDERS (ORDER_DATE);
- CREATE INDEX IDX_ORDERS_CUSTOMER_ID ON ORDERS (CUSTOMER_ID);

Based on these analyses, I've identified several optimization opportunities:

1. The current query doesn't efficiently use indexes
2. The calculation of SUM(o.ORDER_TOTAL) is performed twice
3. We should add indexes on the JOIN and WHERE columns

Here's the optimized version:

```sql
SELECT c.CUSTOMER_NAME, total_sales
FROM CUSTOMERS c
JOIN (
  SELECT CUSTOMER_ID, SUM(ORDER_TOTAL) as total_sales
  FROM ORDERS
  WHERE ORDER_DATE > '2024-01-01'
  GROUP BY CUSTOMER_ID
) o ON c.CUSTOMER_ID = o.CUSTOMER_ID
ORDER BY total_sales DESC
```

This version:
- Reduces the dataset before joining
- Calculates the sum only once
- Will benefit from the recommended indexes

[Claude uses MCP Firebird's analyze-query-performance tool on the new query]

After optimization:
- Average execution time: 320ms (74% faster)
- Rows returned: 487 (same results)

I recommend creating these indexes to further improve performance:
```sql
CREATE INDEX IDX_ORDERS_ORDER_DATE ON ORDERS (ORDER_DATE);
CREATE INDEX IDX_ORDERS_CUSTOMER_ID ON ORDERS (CUSTOMER_ID);
```
```

## Integration with AI Agents

### Claude in the Terminal

You can use the MCP Firebird server with Claude in the terminal:

```bash
# Start the MCP server in one terminal
npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey

# In another terminal, use anthropic CLI with MCP
anthropic messages create \
  --model claude-3-opus-20240229 \
  --max-tokens 4096 \
  --mcp "npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey" \
  --message "Analyze the structure of my Firebird database"
```

### Other AI Agents

The MCP Firebird server is compatible with any agent that implements the MCP protocol, simply by providing the command to start the server:

```
npx mcp-firebird --database /path/to/database.fdb --user SYSDBA --password masterkey
```

## Security

The MCP Firebird server implements comprehensive security measures:

- **Input validation** with Zod schemas
- **SQL query sanitization** to prevent injection attacks
- **Secure credential handling** for database connections
- **SQL injection prevention** through parameterized queries
- **Restriction of destructive operations** like DROP and TRUNCATE
- **Data masking** for sensitive information in query results
- **Audit logging** of all database operations for security and compliance
- **Row-level security** to filter query results based on security rules
- **Resource limits** to prevent abuse and DoS attacks
- **Rate limiting** to control the number of queries per session

### Security Configuration

You can configure security options using a JSON configuration file. Create a file named `security.json` in the project root:

```json
{
  "security": {
    "allowedTables": ["EMPLOYEES", "DEPARTMENTS"],
    "forbiddenTables": ["USERS", "PASSWORDS"],
    "allowedOperations": ["SELECT", "EXECUTE"],
    "forbiddenOperations": ["DROP", "TRUNCATE", "ALTER"],
    "maxRows": 1000,
    "queryTimeout": 5000,
    "dataMasking": [
      {
        "columns": ["CREDIT_CARD", "SSN"],
        "pattern": "\\d{4}-\\d{4}-\\d{4}-\\d{4}",
        "replacement": "XXXX-XXXX-XXXX-$&"
      }
    ],
    "rowFilters": {
      "EMPLOYEES": "DEPARTMENT_ID = 10"
    },
    "audit": {
      "enabled": true,
      "destination": "file",
      "auditFile": "./logs/audit.log",
      "detailLevel": "medium",
      "logQueries": true
    },
    "resourceLimits": {
      "maxRowsPerQuery": 5000,
      "maxResponseSize": 5242880,
      "maxQueryCpuTime": 10000,
      "maxQueriesPerSession": 100,
      "rateLimit": {
        "queriesPerMinute": 60,
        "burstLimit": 20
      }
    },
    "authorization": {
      "type": "basic",
      "rolePermissions": {
        "admin": {
          "allTablesAllowed": true,
          "operations": ["SELECT", "INSERT", "UPDATE", "DELETE"]
        },
        "user": {
          "tables": ["EMPLOYEES", "DEPARTMENTS"],
          "operations": ["SELECT"]
        }
      }
    }
  }
}
```

Then specify the path to the configuration file when starting the server:

```bash
export SECURITY_CONFIG_PATH=./security.json
```

## Debugging and Troubleshooting

To enable debug mode:

```bash
export LOG_LEVEL=debug
```

### Common Issues

1. **Database connection error**:
   - Verify credentials and database path
   - Make sure the Firebird server is running
   - Check that the user has sufficient permissions

2. **Server doesn't appear in Claude Desktop**:
   - Restart Claude Desktop
   - Verify the configuration in `claude_desktop_config.json`
   - Make sure the database path is absolute

3. **STDIO issues**:
   - Ensure standard output is not being redirected
   - Don't use `console.log` for debugging (use `console.error` instead)

## License

MIT
