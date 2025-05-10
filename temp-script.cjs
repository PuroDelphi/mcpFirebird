// This is a temporary script to run the MCP server with environment variables
process.env.FIREBIRD_DATABASE = process.env.FIREBIRD_DATABASE || "F:\\Proyectos\\SAI\\EMPLOYEE.FDB";
process.env.FIREBIRD_USER = process.env.FIREBIRD_USER || "SYSDBA";
process.env.FIREBIRD_PASSWORD = process.env.FIREBIRD_PASSWORD || "masterkey";
process.env.FIREBIRD_HOST = process.env.FIREBIRD_HOST || "localhost";
process.env.FIREBIRD_PORT = process.env.FIREBIRD_PORT || "3050";
process.env.FIREBIRD_ROLE = process.env.FIREBIRD_ROLE || "";

// Now run the MCP server
require('./dist/index.js');
