# Wire Encryption Compatibility Fix

## Overview

This document describes the fix for wire encryption compatibility issues when connecting to Firebird 3.0+ servers, and the path normalization bug that affected Linux/Unix systems.

## Issues Addressed

### Issue #1: Wire Encryption Incompatibility

**Problem**: Users encountered the following error when connecting to Firebird 3.0+ servers:
```
Error connecting to database: Incompatible wire encryption levels requested on client and server
```

**Root Cause**: 
- Firebird 3.0+ introduced wire encryption by default
- The `node-firebird` library doesn't support the new wire protocol yet
- Server-side configuration couldn't be changed in many production environments

**Solution**: Added support for configuring the `WireCrypt` parameter in the connection configuration, allowing users to disable wire encryption on the client side.

### Issue #2: Path Normalization Bug on Linux/Unix

**Problem**: Database paths were being incorrectly normalized on Linux/Unix systems, breaking:
- Remote connection strings (e.g., `hostname:/path/to/database.fdb`)
- Unix absolute paths (e.g., `/var/lib/firebird/database.fdb`)

**Root Cause**: The `normalizeDatabasePath` function was using `path.normalize()` on all paths, which is designed for Windows paths and breaks Unix paths and remote connection strings.

**Solution**: Updated `normalizeDatabasePath` to only normalize local Windows paths, preserving:
- Unix/Linux absolute paths (starting with `/`)
- Remote connection strings (containing `:/`)
- Paths on non-Windows platforms

## Implementation Details

### 1. WireCrypt Configuration

#### Interface Changes

Added `wireCrypt` property to `ConfigOptions` interface:

```typescript
export interface ConfigOptions {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    lowercase_keys?: boolean;
    role?: string;
    pageSize?: number;
    /**
     * Wire encryption setting for Firebird 3.0+
     * - 'Disabled': No wire encryption (compatible with all versions)
     * - 'Enabled': Wire encryption enabled if supported
     * - 'Required': Wire encryption required
     * Default: 'Disabled' for maximum compatibility
     */
    wireCrypt?: 'Disabled' | 'Enabled' | 'Required';
}
```

#### Configuration Sources

The `wireCrypt` parameter can be set through multiple sources (in order of precedence):

1. **Command Line Arguments**:
   ```bash
   npx mcp-firebird --wire-crypt Disabled
   # or
   npx mcp-firebird --wireCrypt Disabled
   ```

2. **Environment Variables**:
   ```bash
   export FIREBIRD_WIRECRYPT=Disabled
   # or
   export FB_WIRECRYPT=Disabled
   ```

3. **Global Configuration** (programmatic):
   ```typescript
   (global as any).MCP_FIREBIRD_CONFIG = {
       host: 'localhost',
       port: 3050,
       database: '/path/to/database.fdb',
       user: 'SYSDBA',
       password: 'masterkey',
       wireCrypt: 'Disabled'
   };
   ```

4. **Default Value**: `'Disabled'` (for maximum compatibility)

#### Valid Values

- `'Disabled'`: No wire encryption (compatible with all Firebird versions)
- `'Enabled'`: Wire encryption enabled if server supports it
- `'Required'`: Wire encryption required (connection fails if not supported)

### 2. Path Normalization Fix

#### Updated Function

```typescript
/**
 * Normalize database path - preserve remote and Unix paths
 * Only normalizes local Windows paths to avoid breaking remote connections
 * and Unix/Linux absolute paths
 * 
 * @param dbPath - Database path to normalize
 * @returns Normalized database path
 */
export function normalizeDatabasePath(dbPath: string | undefined): string {
    if (!dbPath) return '';
    
    // Don't normalize if:
    // 1. Starts with / (Unix/Linux absolute path)
    // 2. Contains :/ (remote connection string like 'hostname:/path/to/db.fdb')
    // 3. Running on non-Windows platform
    if (dbPath.startsWith('/') || 
        dbPath.includes(':/') || 
        process.platform !== 'win32') {
        return dbPath;
    }
    
    // Only normalize local Windows paths
    return path.normalize(dbPath);
}
```

#### Path Handling Examples

| Input Path | Platform | Output | Reason |
|------------|----------|--------|--------|
| `C:\data\db.fdb` | Windows | `C:\data\db.fdb` | Normalized (Windows local) |
| `/var/lib/firebird/db.fdb` | Linux | `/var/lib/firebird/db.fdb` | Preserved (Unix absolute) |
| `server:/data/db.fdb` | Any | `server:/data/db.fdb` | Preserved (remote connection) |
| `192.168.1.100:/data/db.fdb` | Any | `192.168.1.100:/data/db.fdb` | Preserved (remote connection) |
| `./relative/path.fdb` | Linux | `./relative/path.fdb` | Preserved (non-Windows) |

## Usage Examples

### Example 1: Connecting to Firebird 3.0 with Wire Encryption Disabled

```bash
# Using command line
npx mcp-firebird \
  --host 192.168.1.100 \
  --port 3050 \
  --database /data/mydb.fdb \
  --user SYSDBA \
  --password masterkey \
  --wire-crypt Disabled
```

### Example 2: Using Environment Variables

```bash
# Set environment variables
export FIREBIRD_HOST=192.168.1.100
export FIREBIRD_PORT=3050
export FIREBIRD_DATABASE=/data/mydb.fdb
export FIREBIRD_USER=SYSDBA
export FIREBIRD_PASSWORD=masterkey
export FIREBIRD_WIRECRYPT=Disabled

# Run server
npx mcp-firebird
```

### Example 3: Remote Connection String (Linux)

```bash
npx mcp-firebird \
  --database server.example.com:/var/lib/firebird/mydb.fdb \
  --user SYSDBA \
  --password masterkey \
  --wire-crypt Disabled
```

### Example 4: Claude Desktop Configuration

```json
{
  "mcpServers": {
    "firebird": {
      "command": "npx",
      "args": [
        "mcp-firebird@alpha",
        "--database", "/var/lib/firebird/mydb.fdb",
        "--host", "localhost",
        "--port", "3050",
        "--user", "SYSDBA",
        "--password", "masterkey",
        "--wire-crypt", "Disabled"
      ]
    }
  }
}
```

## Troubleshooting

### Error: "Incompatible wire encryption levels"

**Solution**: Add `--wire-crypt Disabled` to your command line or set `FIREBIRD_WIRECRYPT=Disabled` environment variable.

```bash
npx mcp-firebird --wire-crypt Disabled --database /path/to/db.fdb
```

### Error: Database path not found (Linux/Unix)

**Symptoms**:
- Remote connection strings like `server:/path/db.fdb` fail
- Unix absolute paths like `/var/lib/firebird/db.fdb` fail

**Solution**: This should be fixed automatically with the path normalization update. Ensure you're using version 2.4.0-alpha.1 or later.

### Error: I/O error in Windows with mixed-case paths

**Problem**: Database path is converted to uppercase, causing I/O errors in Windows when the original path contains lowercase characters.

**Symptoms**:
- Error message: "I/O error during CreateFile (open) operation"
- The database path contains mixed case (e.g., `C:\MyData\database.fdb`)
- Windows file system is case-insensitive but preserves case

**Root Cause**: This appears to be a behavior in the `node-firebird` library where it may internally convert paths to uppercase for certain operations.

**Workarounds**:

1. **Use all-uppercase paths** (Recommended for Windows):
   ```bash
   npx mcp-firebird@alpha --database C:\MYDATA\DATABASE.FDB
   ```

2. **Use forward slashes instead of backslashes**:
   ```bash
   npx mcp-firebird@alpha --database C:/MyData/database.fdb
   ```

3. **Use environment variables with uppercase paths**:
   ```bash
   export FIREBIRD_DATABASE=C:\MYDATA\DATABASE.FDB
   npx mcp-firebird@alpha
   ```

4. **Use UNC paths** (for network databases):
   ```bash
   npx mcp-firebird@alpha --database \\SERVER\SHARE\DATABASE.FDB
   ```

**Note**: We are investigating this issue and working on a permanent fix. The current implementation (v2.4.0-alpha.1) preserves the original case when passing the path to node-firebird, but the library may still convert it internally. If you encounter this issue, please report it on our GitHub issues page with details about your environment.

### Server-Side Configuration (Alternative)

If you have access to the Firebird server configuration, you can also disable wire encryption server-side by editing `firebird.conf`:

```conf
# For Firebird 3.0
AuthServer = Srp, Legacy_Auth
WireCrypt = Disabled
UserManager = Legacy_UserManager

# For Firebird 4.0
AuthServer = Srp256, Srp, Legacy_Auth
WireCrypt = Disabled
UserManager = Legacy_UserManager
```

**Note**: This requires server restart and may not be possible in production environments.

## Backward Compatibility

- **Default behavior**: `wireCrypt` defaults to `'Disabled'` for maximum compatibility
- **Existing configurations**: Continue to work without changes
- **Path handling**: Improved to handle more cases correctly without breaking existing functionality

## Testing

The fix has been tested with:
- ✅ Firebird 2.5 (no wire encryption)
- ✅ Firebird 3.0 (wire encryption disabled)
- ✅ Firebird 4.0 (wire encryption disabled)
- ✅ Windows local paths
- ✅ Linux/Unix absolute paths
- ✅ Remote connection strings
- ✅ Multiple MCP clients (Claude Desktop, MCP Inspector)

## References

- [Firebird 3.0 Release Notes - Authentication](https://firebirdsql.org/file/documentation/release_notes/html/en/3_0/rnfb30-security-new-authentication.html)
- [Firebird 4.0 Release Notes - SRP256](https://firebirdsql.org/file/documentation/release_notes/html/en/4_0/rlsnotes40.html#rnfb40-config-srp256)
- [node-firebird Documentation](https://www.npmjs.com/package/node-firebird)
- [GitHub Issue #XX](https://github.com/PuroDelphi/mcpFirebird/issues/XX) - Original bug report

## Version History

- **v2.4.0-alpha.0**: Initial implementation of wire encryption configuration and path normalization fix

