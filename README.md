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
```

### Using with npx

You can run the server directly with npx:

```bash
npx mcp-firebird --host localhost --port 3050 --database /path/to/database.fdb --user SYSDBA --password masterkey
```

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
      ]
    }
  }
}
```

<Warning>
  Make sure to use absolute paths in the configuration.
</Warning>

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

The **get-field-descriptions** tool is especially useful for AI models, as it retrieves comments from Firebird's RDB$DESCRIPTION metadata, providing additional semantic context about the purpose of each field.

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

You can run the MCP Firebird server in a Docker container:

### Dockerfile

```dockerfile
FROM node:18-alpine

# Install necessary dependencies for Firebird
RUN apk add --no-cache firebird-client

# Create application directory
WORKDIR /app

# Copy project files
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Compile the TypeScript project
RUN npm run build

# Expose port if HTTP is used (optional)
# EXPOSE 3000

# Set default environment variables
ENV FIREBIRD_HOST=firebird-db
ENV FIREBIRD_PORT=3050
ENV FIREBIRD_USER=SYSDBA
ENV FIREBIRD_PASSWORD=masterkey
ENV FIREBIRD_DATABASE=/firebird/data/database.fdb

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

  # MCP Firebird server
  mcp-firebird:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      FIREBIRD_HOST: firebird-db
      FIREBIRD_PORT: 3050
      FIREBIRD_USER: SYSDBA
      FIREBIRD_PASSWORD: masterkey
      FIREBIRD_DATABASE: /firebird/data/database.fdb
    depends_on:
      - firebird-db
    networks:
      - mcp-network
    # For use with Claude Desktop, expose STDIO
    stdin_open: true
    tty: true

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

# Check logs
docker compose logs -f mcp-firebird

# Stop services
docker compose down
```

## Recent Updates

### Version 1.0.93 (Updated from 1.0.91)

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

## Example of Query Optimization

```
User: I have this query that's running slowly, can you optimize it?
SELECT c.CUSTOMER_NAME, SUM(o.ORDER_TOTAL) 
FROM CUSTOMERS c 
JOIN ORDERS o ON c.CUSTOMER_ID = o.CUSTOMER_ID 
WHERE o.ORDER_DATE > '2024-01-01' 
GROUP BY c.CUSTOMER_NAME 
ORDER BY SUM(o.ORDER_TOTAL) DESC

Claude: I'll analyze this query to optimize it.

[Claude uses MCP Firebird to analyze the schema and query]

I've identified several optimization opportunities:

1. The current query doesn't efficiently use indexes
2. The calculation of SUM(o.ORDER_TOTAL) is performed twice

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
- Could benefit from an index on ORDERS(ORDER_DATE, CUSTOMER_ID, ORDER_TOTAL)

When running both queries on your database, the optimized version is approximately 45% faster.
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

The server implements the following security measures:

- Input validation with Zod
- SQL query sanitization
- Secure credential handling
- SQL injection prevention
- Restriction of destructive operations

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
