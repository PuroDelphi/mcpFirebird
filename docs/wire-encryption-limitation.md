# Wire Encryption Limitation - IMPORTANT

## ⚠️ Critical Limitation

**The `node-firebird` library does NOT support Firebird 3.0+ wire encryption protocol.**

This means that `mcp-firebird` **CANNOT** connect to Firebird 3.0+ servers that have wire encryption enabled, regardless of any client-side configuration.

## The Problem

When connecting to a Firebird 3.0+ server with wire encryption enabled, you will see this error:

```
Error connecting to database: Incompatible wire encryption levels requested on client and server
```

## Why the `--wire-crypt` Parameter Doesn't Work

The `--wire-crypt` parameter was added to `mcp-firebird` based on a misunderstanding of the `node-firebird` library's capabilities. 

**The truth is:**
- `node-firebird` does NOT implement the Firebird 3.0+ wire encryption protocol
- The library can ONLY connect to servers with wire encryption **disabled**
- No client-side parameter can change this limitation

## The ONLY Solution

You **MUST** disable wire encryption on the Firebird server by modifying the `firebird.conf` file.

### For Firebird 3.0

Add or modify these lines in `firebird.conf`:

```conf
AuthServer = Srp, Legacy_Auth
WireCrypt = Disabled
UserManager = Legacy_UserManager
```

### For Firebird 4.0

Add or modify these lines in `firebird.conf`:

```conf
AuthServer = Srp256, Srp, Legacy_Auth
WireCrypt = Disabled
UserManager = Legacy_UserManager
```

### For Firebird 5.0 (Docker)

If using Docker, set environment variables in your `docker-compose.yml`:

```yaml
services:
  firebird:
    image: firebirdsql/firebird:5
    environment:
      FIREBIRD_ROOT_PASSWORD: masterkey
      FIREBIRD_CONF_WireCrypt: Disabled
      FIREBIRD_CONF_AuthServer: Srp256, Srp
```

**Credit**: Solution for Firebird 5.0 Docker provided by [@esciara](https://github.com/PuroDelphi/mcpFirebird/issues/XX)

## What If I Can't Change Server Configuration?

If you cannot modify the Firebird server configuration (e.g., company-managed server), you have these options:

### Option 1: Request Server Configuration Change

Contact your database administrator and request that they disable wire encryption for your connection. Explain that:
- The Node.js Firebird client library doesn't support the new wire protocol
- Wire encryption can be disabled for specific connections while keeping it enabled for others
- This is a known limitation of the `node-firebird` library

### Option 2: Use a Different Client Library

Consider using a different Firebird client that supports wire encryption:

**Python Alternative:**
- Library: `firebirdsql` or `fdb`
- Both support Firebird 3.0+ wire encryption
- You could create a simple REST API wrapper around these libraries

**Example Python wrapper:**
```python
import firebirdsql
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route('/query', methods=['POST'])
def execute_query():
    with firebirdsql.connect(
        host=request.json['host'],
        port=request.json['port'],
        database=request.json['database'],
        user=request.json['user'],
        password=request.json['password'],
        charset='UTF8'
    ) as conn:
        cursor = conn.cursor()
        cursor.execute(request.json['sql'])
        return jsonify(cursor.fetchall())

if __name__ == '__main__':
    app.run(port=5000)
```

Then configure `mcp-firebird` to use this wrapper (requires custom development).

### Option 3: Use Firebird 2.5

If possible, use a Firebird 2.5 server which doesn't have wire encryption enabled by default.

### Option 4: Wait for Library Update

Monitor the `node-firebird` repository for updates that add wire encryption support:
- GitHub: https://github.com/hgourvest/node-firebird
- NPM: https://www.npmjs.com/package/node-firebird

**Note**: As of October 2025, there is no active development on wire encryption support.

## Alternative Libraries to Consider

If wire encryption support is critical for your use case, consider these alternatives:

1. **node-firebird-native-api** (if it exists and supports wire encryption)
2. **Create a bridge** using Python's `firebirdsql` library
3. **Use Firebird's REST API** (if available in your version)
4. **Contribute to node-firebird** to add wire encryption support

## Authentication Issues (Firebird 5.0)

If you see this error:
```
Error connecting to database: Error occurred during login, please check server firebird.log for details
```

And the Firebird logs show:
```
Authentication error
No matching plugins on server
```

**Solution**: Add `AuthServer` configuration to your Firebird server:

```conf
AuthServer = Srp256, Srp
```

Or in Docker:
```yaml
FIREBIRD_CONF_AuthServer: Srp256, Srp
```

## Summary

| Scenario | Solution |
|----------|----------|
| You control the server | Disable `WireCrypt` in `firebird.conf` |
| Docker deployment | Set `FIREBIRD_CONF_WireCrypt: Disabled` |
| Company-managed server | Request admin to disable wire encryption |
| Cannot change server | Use alternative client library or Python wrapper |
| Authentication error (FB5) | Add `AuthServer: Srp256, Srp` to server config |

## References

- [node-firebird Documentation](https://www.npmjs.com/package/node-firebird)
- [Firebird 3.0 Release Notes - Security](https://firebirdsql.org/file/documentation/release_notes/html/en/3_0/rnfb30-security-new-authentication.html)
- [Firebird 4.0 Release Notes - SRP256](https://firebirdsql.org/file/documentation/release_notes/html/en/4_0/rlsnotes40.html#rnfb40-config-srp256)
- [Firebird 4 Migration Guide](https://ib-aid.com/download/docs/fb4migrationguide.html#_authorization_with_firebird_2_5_client_library_fbclient_dll)

## Acknowledgments

- Issue reported by [@TorstenKruse](https://github.com/PuroDelphi/mcpFirebird/issues/XX)
- Firebird 5.0 Docker solution by [@esciara](https://github.com/PuroDelphi/mcpFirebird/issues/XX)
- Path normalization fix suggested by [@NilsHaase](https://github.com/PuroDelphi/mcpFirebird/issues/XX)

