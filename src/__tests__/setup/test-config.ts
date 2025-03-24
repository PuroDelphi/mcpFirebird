import { MCPConfig } from '../../types';

export const testConfig: MCPConfig = {
  host: process.env.FIREBIRD_HOST || 'localhost',
  port: Number(process.env.FIREBIRD_PORT) || 3050,
  database: process.env.FIREBIRD_DATABASE || 'F:\\Descargas\\Romexis\\20250224\\romexis.fdb',
  user: process.env.FIREBIRD_USER || 'SYSDBA',
  password: process.env.FIREBIRD_PASSWORD || 'masterkey'
};

export const testTable = 'RBA_GLOBAL_SETTING';
export const testData = {
  id: 999,
  name: 'TEST_SETTING',
  value: 'test_value'
}; 