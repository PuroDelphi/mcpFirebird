# Changelog

All notable changes to this project will be documented in this file.

## [2.6.0-alpha.12] - 2025-10-24

### Fixed
- **get-server-info tool**: Fixed hardcoded version number
  - Now reads version dynamically from package.json instead of using hardcoded "2.2.0-alpha.1"
  - Also reads name and description from package.json for consistency
  - Version now correctly reflects the actual running version

## [2.6.0-alpha.11] - 2025-10-24

### Changed
- **get-execution-plan tool**: Simplified implementation to return informative message
  - Removed all legacy code attempting to use SET PLANONLY/SET PLAN commands (isql-specific, not supported by drivers)
  - Removed attempts to use non-existent getPlan() and getInfo() methods
  - Now returns clear explanation that execution plan retrieval is not available through Node.js Firebird drivers
  - Provides detailed recommendations for using Firebird tools (isql, FlameRobin, IBExpert)
  - Suggests using analyze-query-performance tool as alternative for performance analysis

### Technical Notes
- Research confirmed that node-firebird-driver-native and node-firebird do not expose isc_dsql_sql_info API
- The Firebird API provides isc_info_sql_get_plan (constant: 22) but this is not available in high-level driver interfaces
- Low-level node-firebird-native-api would be needed but requires significant refactoring
- FDB (Python driver) successfully uses: isc_dsql_sql_info(statement_handle, [isc_info_sql_get_plan])

## [2.6.0-alpha.10] - 2025-10-24

### 🔧 Fixed
- **get-execution-plan Tool**: Fixed API method for retrieving execution plans with native driver
  - Changed from non-existent `statement.getPlan()` to `statement.getInfo([22])` (isc_info_sql_get_plan)
  - Uses correct Firebird API constant (22 = isc_info_sql_get_plan) to retrieve execution plan
  - Properly handles getInfo() response to extract plan string
  - Falls back to legacy method if getInfo() is not available or fails
  - **This should now correctly retrieve execution plans using the native driver API**

## [2.6.0-alpha.9] - 2025-10-24

### 🔧 Fixed
- **Native Driver Detection**: Fixed detection of native driver in `get-execution-plan` tool
  - Now uses `DriverFactory.getDriverInfo()` instead of `process.env.USE_NATIVE_DRIVER`
  - Properly detects when native driver is active and configured
  - Added debug logging to show driver detection status
  - **This should now correctly use `getPlan()` API when `--use-native-driver` flag is set**

## [2.6.0-alpha.8] - 2025-10-24

### 🔧 Fixed
- **get-execution-plan Tool**: Implemented proper native driver support using Firebird API's `getPlan()` method
  - Now uses `statement.getPlan()` from node-firebird-driver-native for accurate execution plans
  - Properly prepares statement, retrieves plan, and cleans up resources (statement, transaction, attachment)
  - Falls back to legacy methods if native driver is not available or fails
  - Improved error handling and logging for debugging
  - **Important**: `SET PLANONLY` and `SET PLAN` are isql-specific commands and don't work through programmatic drivers

### 📝 Technical Details
- Native driver creates attachment, starts transaction, prepares statement, and calls `getPlan()` API method
- Legacy fallback attempts `SET PLAN ON` for pure-js driver (limited functionality)
- Comprehensive resource cleanup in all code paths (success and error)

## [2.6.0-alpha.7] - 2025-10-24

### 🔧 HTTP Streamable Transport Fixes
- **Fixed Stateless Mode**: Implemented correct stateless pattern following official MCP SDK documentation
- **Port Configuration Bug**: Fixed issue where `--http-port` parameter was being ignored
- **Transport Priority**: HTTP_PORT now correctly prioritized for HTTP transport type
- **Shared Server Instance**: Optimized to reuse server instance while creating new transport per request
- **MCP Inspector Compatibility**: Now works correctly with MCP Inspector without requiring session management

### 📚 Examples Modernization
- **New Examples Structure**: Organized examples into config/, clients/, and legacy/ folders
- **TypeScript Client**: Added modern Streamable HTTP client example
- **Python Client**: Added Python client example with requirements.txt
- **JavaScript Client**: Added JavaScript client example
- **Configuration Examples**: Added Claude Desktop, VS Code, and environment variables examples
- **Legacy SSE**: Moved deprecated SSE examples to legacy/ folder

### 🧹 Project Cleanup
- **Removed 40+ Temporary Files**: Cleaned up test scripts, temporary files, and legacy code
- **Updated .gitignore**: Added patterns to prevent temporary files from being committed
- **Removed Legacy Proxy**: Deleted mcp-sse-proxy folder and related files
- **Removed Old Release Notes**: Consolidated release notes into CHANGELOG.md
- **Better Organization**: Cleaner project structure for easier maintenance

### 📖 Documentation
- **Examples README**: Comprehensive guide for all example types
- **Transport Types**: Updated documentation to reflect stateless as default
- **Configuration Guide**: Enhanced with modern examples

### ✅ Compatibility
- Fully backward compatible with previous alpha versions
- Stateless mode is now default (can be changed with STREAMABLE_STATELESS_MODE=false)
- All existing STDIO and SSE integrations continue to work

## [2.6.0-alpha.2] - 2025-01-22

### 🔄 Sync with Main
- Synced with main branch v2.5.1 release
- Ready for next development cycle

## [2.5.1] - 2025-01-22

### 🌐 Smithery Platform Support
- **Official Smithery Integration**: One-click cloud deployment support
- **Smithery Configuration**: Complete smithery.yaml and smithery.config.js
- **HTTP/Streamable Transport**: Optimized entry points for web-based deployment
- **Comprehensive Documentation**: docs/smithery-deployment.md with step-by-step guide
- **README Updates**: Added Smithery quick start section

### 🔒 Enhanced Wire Encryption
- **Improved Documentation**: Clearer wire encryption setup instructions
- **Security Emphasis**: Highlighted enterprise-grade encryption capabilities
- **Configuration Examples**: Multiple scenarios for wire encryption setup
- **Verification Tools**: Built-in encryption status checks

### 📚 Documentation Improvements
- **RELEASE_NOTES_v2.5.1.md**: Comprehensive release documentation
- **Smithery Quick Start**: Easy-to-follow deployment guide
- **Wire Encryption Guide**: Enhanced security documentation
- **Configuration Examples**: Real-world deployment scenarios

### ✅ Compatibility
- Fully backward compatible with v2.5.0
- All existing deployments continue to work
- No breaking changes

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
