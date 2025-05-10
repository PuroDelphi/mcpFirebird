@echo off
echo Starting MCP Inspector with MCP Firebird in STDIO mode...
npx @modelcontextprotocol/inspector --transport-type stdio --command node --args "dist/cli.js --database F:\Proyectos\SAI\EMPLOYEE.FDB"
pause