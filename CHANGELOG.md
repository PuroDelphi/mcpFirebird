# Changelog

All notable changes to this project will be documented in this file.

## [2.6.0-alpha.1] - 2025-01-22

### 🔄 Smithery Integration
- **Merged Smithery compatibility** from smithery/config-u9cv branch
- All Smithery deployment features now available in alpha branch
- No breaking changes to existing STDIO functionality

## [2.6.0-alpha.0] - 2025-01-22

### 🎯 MCP Modernization 2025

This release brings the MCP Firebird server fully up-to-date with the latest Model Context Protocol specifications and best practices.

#### 🌐 Smithery Platform Compatibility
- **Updated Smithery Entry Points**: All Smithery deployment files now use modern MCP APIs
  - `src/smithery-entry.ts`: Updated with modern registration APIs and capabilities
  - `src/http-entry.ts`: Updated HTTP transport with modern APIs and capabilities
  - `src/smithery.ts`: Added capabilities declaration
- **Fixed smithery.yaml**: Corrected configSchema to proper JSON Schema format
  - Changed from flat property structure to proper `type`, `required`, and `properties` format
  - Added `enum` for logLevel field
- **Type Compatibility**: Fixed all TypeScript type issues for Smithery deployment
  - Prompt handlers now ensure correct role types (user/assistant)
  - Resource handlers now accept URL parameter instead of string
  - Proper ZodRawShape extraction for all schemas
- **Build Verification**: ✅ Successful compilation with zero TypeScript errors

#### ✅ API Modernization
- **Updated Tool Registration**: Migrated from `server.tool()` to `server.registerTool()` with modern signature
  - Separated `title` and `description` in options object
  - Direct parameter access in handlers (no more `extra` wrapper)
  - Better schema validation with ZodRawShape extraction

- **Updated Prompt Registration**: Migrated from `server.prompt()` to `server.registerPrompt()`
  - Changed `inputSchema` to `argsSchema` for clarity
  - Improved parameter handling
  - Consistent options structure

- **Updated Resource Registration**: Migrated from `server.resource()` to `server.registerResource()`
  - Added `mimeType` support
  - Enhanced metadata with title and description
  - Direct URI parameter in handlers

#### 🔧 Capabilities Declaration
- **Explicit Capabilities**: All servers now declare capabilities with `listChanged` flags
  - `tools: { listChanged: true }`
  - `prompts: { listChanged: true }`
  - `resources: { listChanged: true, subscribe: false }`
- Better client interoperability
- Clear feature advertisement

#### 📦 Schema Handling
- **Zod Integration**: Automatic extraction of `ZodRawShape` from `ZodObject` schemas
- **Type Safety**: Improved TypeScript types for all handlers
- **Validation**: Maintained Zod validation while adapting to SDK requirements

#### 🗂️ Code Organization
- **Legacy Code Marked**: `create-server.ts` marked as deprecated with clear migration path
- **Type Definitions Updated**: Modern capability types in `modelcontextprotocol.d.ts`
- **Build Configuration**: Excluded test files from production builds

#### 📚 Documentation
- **New Guide**: Added `docs/mcp-modernization-2025.md` with complete migration guide
- **API Examples**: Updated examples showing before/after patterns
- **Best Practices**: Documented modern MCP patterns and recommendations

#### 🔄 Backwards Compatibility
- **Legacy Mode**: Preserved legacy server implementation (use `USE_LEGACY_SERVER=true`)
- **No Breaking Changes**: Existing configurations continue to work
- **Gradual Migration**: Users can migrate at their own pace

#### 🛠️ Developer Experience
- **Cleaner Code**: Removed unused imports and deprecated patterns
- **Better Errors**: Improved error messages and logging
- **Type Safety**: Enhanced TypeScript support throughout

### Technical Details
- SDK Version: `@modelcontextprotocol/sdk ^1.13.2`
- Node.js: 18+ required
- TypeScript: Strict mode enabled
- Build: Successful with zero errors

### Migration Notes
- No changes required for existing users
- New implementations should use modern APIs
- See `docs/mcp-modernization-2025.md` for detailed migration guide

## [2.2.0] - 2025-06-27

### 🚀 Major Features Added
- **SSE Transport Support**: Full implementation of Server-Sent Events transport for MCP Inspector compatibility
- **Backwards Compatible Server**: Official MCP SDK implementation supporting both Streamable HTTP and SSE
- **Multi-Protocol Support**: Single server instance supporting STDIO, SSE, and HTTP transports simultaneously
- **Windows Path Handling**: Proper escaping and handling of Windows file paths with backslashes

### 🔧 Technical Improvements
- **MCP SDK v1.13.2**: Updated to latest Model Context Protocol TypeScript SDK
- **Modern API Implementation**: Using official registerTool(), registerPrompt() methods
- **Session Management**: Robust session handling for HTTP-based transports
- **Error Handling**: Enhanced error handling and logging throughout the application
- **Express Integration**: Clean Express.js integration for HTTP endpoints

### 🌐 New Endpoints
- **Modern Streamable HTTP**: `POST/GET/DELETE /mcp` for latest MCP clients
- **Legacy SSE**: `GET /sse` for backwards compatibility
- **Legacy Messages**: `POST /messages` for older client support

### 🛠️ Developer Experience
- **MCP Inspector Support**: Full compatibility with both STDIO and SSE transports
- **Improved Logging**: Detailed debug and info logging for troubleshooting
- **Better Documentation**: Comprehensive examples and configuration guides

### 🔒 Stability & Compatibility
- **STDIO Preserved**: All existing STDIO functionality maintained without changes
- **Production Ready**: Thoroughly tested with real Firebird databases
- **Cross-Platform**: Enhanced Windows and Linux compatibility

### 📊 Testing & Verification
- **Database Connections**: Tested with multiple Firebird database files
- **Transport Reliability**: Stable SSE connections without ECONNRESET errors
- **Inspector Integration**: Verified working with MCP Inspector on both transports
## [2.1.0] - 2024-07-27

### Added
- Added `execute-batch-queries` tool for executing multiple SQL queries in parallel
- Added `describe-batch-tables` tool for retrieving schema information of multiple tables in parallel
- Added modern McpServer implementation following the latest MCP recommendations
- Added support for ResourceTemplate for more flexible resource definitions
- Added improved error handling with more detailed logging
- Added implementation of modern McpServer as default server
- Added backward compatibility with legacy Server implementation

### Fixed
- Fixed issue with field descriptions not being properly retrieved from Firebird BLOB fields
- Improved SQL queries for retrieving field descriptions using CAST to VARCHAR
<<<<<<< HEAD
=======
- Fixed hardcoded localhost values in connection handling by replacing with 127.0.0.1
- Improved Smithery integration by passing parameters directly as command line arguments
- Enhanced error messages for connection issues with more specific troubleshooting guidance
- Added support for firebirdHost, firebirdPort, etc. parameters in addition to host, port, etc.
- Updated smithery.yaml with better example configuration
- Improved SSE transport implementation for better compatibility with modern clients

## [2.0.11-alpha.3] - 2024-07-27

### Added
- Added `describe-batch-tables` tool for retrieving schema information of multiple tables in parallel
- Improved performance for database schema analysis operations

## [2.0.11-alpha.2] - 2024-07-27

### Added
- Added `execute-batch-queries` tool for executing multiple SQL queries in parallel
- Improved performance for batch database operations

## [2.0.11-alpha.1] - 2024-07-27

### Added
- Added implementation of modern McpServer as default server
- Added backward compatibility with legacy Server implementation

## [2.0.11-alpha.0] - 2024-07-27

### Added
- Added modern McpServer implementation following the latest MCP recommendations
- Added support for ResourceTemplate for more flexible resource definitions
- Added improved error handling with more detailed logging

### Fixed
>>>>>>> alpha
- Fixed hardcoded localhost values in connection handling by replacing with 127.0.0.1
- Improved Smithery integration by passing parameters directly as command line arguments
- Enhanced error messages for connection issues with more specific troubleshooting guidance
- Added support for firebirdHost, firebirdPort, etc. parameters in addition to host, port, etc.
- Updated smithery.yaml with better example configuration
- Improved SSE transport implementation for better compatibility with modern clients

## [2.0.10] - 2024-07-27

### Added
- Added new `sse` script for easier development with Server-Sent Events
- Added example video showing MCP Firebird in action with Claude
- Added information about Asistentes Autónomos as another way to support the project

### Changed
- Updated Dockerfile to include new STDIO mode scripts
- Updated Docker documentation for STDIO mode with MCP Inspector
- Improved parameter typing in database.ts for better code quality
- Updated README files with more comprehensive examples and documentation

## [2.0.10-alpha.0] - 2024-07-10

### Changed
- Updated Dockerfile to include new STDIO mode scripts
- Updated Docker documentation for STDIO mode with MCP Inspector

## [2.0.9] - 2024-07-10

### Fixed
- Fixed environment variable handling in STDIO mode with MCP Inspector
- Added hardcoded default database path as fallback when environment variables are not set
- Improved batch file creation for running MCP Firebird with Inspector

## [2.0.8] - 2024-07-01

### Added
- Added support for SSE transport
- Added support for MCP Inspector
- Added support for multiple database connections

### Fixed
- Fixed issues with environment variables
- Fixed issues with CLI parameters

## [2.0.7] - 2024-06-15

### Added
- Initial release with basic functionality
- Support for Firebird database connections
- Support for executing SQL queries
- Support for listing tables and views
