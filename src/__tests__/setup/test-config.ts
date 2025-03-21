import { MCPConfig } from '../../../types/mcp';

export const testConfig: MCPConfig = {
  host: process.env.FB_HOST || 'localhost',
  port: parseInt(process.env.FB_PORT || '3050'),
  database: process.env.FB_DATABASE || 'F:\\Descargas\\Romexis\\20250224\\romexis.fdb',
  user: process.env.FB_USER || 'sysdba',
  password: process.env.FB_PASSWORD || 'masterkey',
  maxConnections: 5,
  queryTimeout: 5000,
  logLevel: 'debug'
};

export const testTable = 'RBA_GLOBAL_SETTING';
export const testData = {
  id: 999,
  name: 'TEST_SETTING',
  value: 'test_value'
}; 