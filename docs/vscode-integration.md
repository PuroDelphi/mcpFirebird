# Using MCP Firebird with VSCode and GitHub Copilot

This guide explains how to integrate MCP Firebird with Visual Studio Code and GitHub Copilot.

## Prerequisites

1. Visual Studio Code installed
2. GitHub Copilot extension installed and configured
3. MCP Firebird installed (`npm install -g mcp-firebird`)
4. Firebird database server running

## Configuration

1. Create a `.vscode` folder in your project root if it doesn't exist already
2. Create a file named `mcp.json` inside the `.vscode` folder with the following content:

```json
{
  "servers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird",
        "--database",
        "C:\\path\\to\\database.fdb",
        "--host",
        "localhost",
        "--port",
        "3050",
        "--database",
        "/path/to/database.fdb",
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

3. Replace the placeholders with your actual Firebird database connection details:
   - `your_host`: The hostname or IP address of your Firebird server
   - `/path/to/your/database.fdb`: The path to your Firebird database file
   - `your_username`: Your Firebird database username (typically "SYSDBA")
   - `your_password`: Your Firebird database password

## Using with GitHub Copilot

Once configured, you can use GitHub Copilot to interact with your Firebird database. For example:

1. Open a new chat with GitHub Copilot
2. Ask questions about your database, such as:
   - "List all tables in my Firebird database"
   - "Show me the structure of the EMPLOYEES table"
   - "Execute a query to find all employees in the Sales department"

## Troubleshooting

If you encounter errors like `Failed to validate tool: Error: tool parameters array type must have items`, make sure you're using the latest version of MCP Firebird (2.0.7-alpha.7 or later).

To update to the latest version:

```bash
npm install -g mcp-firebird@latest
```

## Common Issues

1. **Connection errors**: Verify your database connection parameters in the `mcp.json` file.
2. **Tool validation errors**: Make sure you're using the latest version of MCP Firebird.
3. **Permission issues**: Ensure your user has the necessary permissions to access the database.

## Example Queries

Here are some example queries you can try with GitHub Copilot:

```
List all tables in my database
```

```
Describe the structure of the CUSTOMERS table
```

```
Execute this query: SELECT * FROM EMPLOYEES WHERE DEPARTMENT_ID = 10
```

```
Analyze the performance of this query: SELECT * FROM ORDERS WHERE ORDER_DATE > '2023-01-01'
```
