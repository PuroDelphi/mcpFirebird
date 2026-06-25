# Environment Managed Authorization (EMA)

**Environment Managed Authorization** (or **EMA**) is a new feature designed to improve security when connecting the Firebird MCP server with interfaces that demand strict access controls, such as servers exposed via containers, automated flows (n8n), or secure local deployments.

Instead of requiring database passwords and MCP server configuration to be entered statically in the command line (where they are visible to other system processes), EMA abstracts this by asking only for an **API Key**.

---

## 1. How does EMA work?

When you start `mcp-firebird`, instead of passing the username, host, and database as flags, you only pass the `--api-key` flag.

This key will be used by the server to verify that the client is allowed to connect and to securely inject the real Firebird credentials (`FIREBIRD_REAL_PASSWORD`, etc.) from your secure environment variable system (`.env` or Docker secrets).

### Benefits
- **Security**: Passwords never appear in the process registry (avoiding `ps -ef` type vulnerabilities).
- **Centralized Control**: Secrets are handled through secure `.env` files.
- **Transparent**: When invoking EMA mode via `--api-key`, the server automatically knows it should enforce the most secure connection mode possible (such as automatically enabling the Native Driver).

---

## 2. EMA Configuration

### Step 1: Set up the `.env` file
Make sure you have a `.env` file in the directory where you run the server from (or have these variables configured in your container environment).

```env
# Your actual server configuration (Keep this secret)
FIREBIRD_HOST=localhost
FIREBIRD_PORT=3050
FIREBIRD_DATABASE=C:\path\to\your\database.fdb
FIREBIRD_USER=SYSDBA
FIREBIRD_PASSWORD=your_super_secret
FIREBIRD_ROLE=
```

### Step 2: Start the server using EMA

Launch the `mcp-firebird` server using the `--api-key` flag and assign it a token. If you omit the value but provide the flag, the system will use the value of the `FIREBIRD_CLIENT_TOKEN` environment variable.

**Example from local command line:**
```bash
npx -y mcp-firebird --api-key="my-secret-token"
```

**Example configuration in an MCP Client (Claude Desktop):**
```json
{
  "mcpServers": {
    "mcp-firebird": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-firebird",
        "--api-key",
        "my-secret-token"
      ],
      "env": {
        "FIREBIRD_DATABASE": "F:\\Path\\to\\your\\db.FDB",
        "FIREBIRD_PASSWORD": "your_real_password"
      }
    }
  }
}
```

---

## 3. EMA and the Native Driver

A major advantage of EMA is that `mcp-firebird` has been programmed to understand that if you pass an `api-key` from the CLI interface, **it prioritizes automatically enabling the Native Firebird Driver**.

This is because EMA is intended for production environments, and the Native Driver is the only one that supports **Wire Encryption** (native network encryption in Firebird 3.0+) and reliable, robust handling of **Events and Triggers**.

Therefore:
> By invoking `--api-key`, you simultaneously enable both Managed Authorization and the database's Bidirectional Streaming capabilities.
