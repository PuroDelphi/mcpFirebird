# Changelog

All notable changes to this project will be documented in this file.

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
