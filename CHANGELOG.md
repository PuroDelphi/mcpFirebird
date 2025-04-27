# Changelog

All notable changes to this project will be documented in this file.

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
