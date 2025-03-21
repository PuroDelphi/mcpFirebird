import { connect } from 'mcp-firebird';
import { testConfig, testTable, testData } from '../setup/test-config';

describe('MCP Firebird', () => {
  let mcpConnection: any;

  beforeAll(async () => {
    mcpConnection = await connect(testConfig);
  });

  afterAll(async () => {
    await mcpConnection.disconnect();
  });

  describe('Conexión', () => {
    it('debería establecer una conexión exitosa', async () => {
      expect(mcpConnection).toBeDefined();
    });
  });

  describe('Consultas', () => {
    it('debería ejecutar una consulta simple', async () => {
      const result = await mcpConnection.query({
        sql: `SELECT * FROM ${testTable} WHERE ID = ?`,
        params: [1]
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it('debería manejar errores de consulta', async () => {
      await expect(mcpConnection.query({
        sql: 'SELECT * FROM tabla_inexistente'
      })).rejects.toThrow();
    });
  });

  describe('Análisis', () => {
    it('debería obtener información de estructura de tabla', async () => {
      const result = await mcpConnection.analyze({
        type: 'table_structure',
        table: testTable,
        options: {
          includeIndexes: true,
          includeConstraints: true
        }
      });
      expect(result).toHaveProperty('name', testTable);
      expect(result).toHaveProperty('columns');
    });

    it('debería analizar tendencias de datos', async () => {
      const result = await mcpConnection.analyze({
        type: 'data_trends',
        table: testTable,
        options: {
          field: 'VALUE',
          period: 'monthly'
        }
      });
      expect(result).toHaveProperty('table', testTable);
      expect(result).toHaveProperty('trends');
    });
  });

  describe('Operaciones CRUD', () => {
    it('debería insertar un registro', async () => {
      const result = await mcpConnection.query({
        sql: `INSERT INTO ${testTable} (ID, NAME, VALUE) VALUES (?, ?, ?)`,
        params: [testData.id, testData.name, testData.value]
      });
      expect(result).toBeDefined();
    });

    it('debería leer un registro', async () => {
      const result = await mcpConnection.query({
        sql: `SELECT * FROM ${testTable} WHERE ID = ?`,
        params: [testData.id]
      });
      expect(result[0]).toMatchObject(testData);
    });

    it('debería actualizar un registro', async () => {
      const newValue = 'updated_value';
      await mcpConnection.query({
        sql: `UPDATE ${testTable} SET VALUE = ? WHERE ID = ?`,
        params: [newValue, testData.id]
      });

      const result = await mcpConnection.query({
        sql: `SELECT * FROM ${testTable} WHERE ID = ?`,
        params: [testData.id]
      });
      expect(result[0].VALUE).toBe(newValue);
    });

    it('debería eliminar un registro', async () => {
      await mcpConnection.query({
        sql: `DELETE FROM ${testTable} WHERE ID = ?`,
        params: [testData.id]
      });

      const result = await mcpConnection.query({
        sql: `SELECT * FROM ${testTable} WHERE ID = ?`,
        params: [testData.id]
      });
      expect(result).toHaveLength(0);
    });
  });
}); 