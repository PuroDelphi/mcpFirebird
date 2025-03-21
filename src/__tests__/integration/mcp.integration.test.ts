import { mcpConnection } from '../setup/integration';
import { testTable, testData } from '../setup/test-config';

describe('MCP Firebird Integration', () => {
  describe('Conexión y Estado', () => {
    it('debería mantener una conexión estable', async () => {
      const result = await mcpConnection.query({
        sql: 'SELECT CURRENT_TIMESTAMP FROM RDB$DATABASE'
      });
      expect(result).toBeDefined();
    });
  });

  describe('Operaciones Complejas', () => {
    it('debería ejecutar una transacción completa', async () => {
      // Iniciar transacción
      await mcpConnection.query({
        sql: 'SET TRANSACTION'
      });

      try {
        // Insertar datos
        await mcpConnection.query({
          sql: `INSERT INTO ${testTable} (ID, NAME, VALUE) VALUES (?, ?, ?)`,
          params: [testData.id, testData.name, testData.value]
        });

        // Verificar inserción
        const inserted = await mcpConnection.query({
          sql: `SELECT * FROM ${testTable} WHERE ID = ?`,
          params: [testData.id]
        });
        expect(inserted[0]).toMatchObject(testData);

        // Actualizar datos
        const newValue = 'transaction_value';
        await mcpConnection.query({
          sql: `UPDATE ${testTable} SET VALUE = ? WHERE ID = ?`,
          params: [newValue, testData.id]
        });

        // Verificar actualización
        const updated = await mcpConnection.query({
          sql: `SELECT * FROM ${testTable} WHERE ID = ?`,
          params: [testData.id]
        });
        expect(updated[0].VALUE).toBe(newValue);

        // Commit
        await mcpConnection.query({
          sql: 'COMMIT'
        });
      } catch (error) {
        // Rollback en caso de error
        await mcpConnection.query({
          sql: 'ROLLBACK'
        });
        throw error;
      }
    });

    it('debería manejar múltiples conexiones simultáneas', async () => {
      const queries = Array(5).fill(null).map(() => 
        mcpConnection.query({
          sql: `SELECT * FROM ${testTable} WHERE ID = ?`,
          params: [1]
        })
      );

      const results = await Promise.all(queries);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('Análisis de Datos', () => {
    it('debería analizar la estructura completa de la tabla', async () => {
      const result = await mcpConnection.analyze({
        type: 'table_structure',
        table: testTable,
        options: {
          includeIndexes: true,
          includeConstraints: true,
          includeTriggers: true,
          includeProcedures: true
        }
      });

      expect(result).toHaveProperty('name', testTable);
      expect(result).toHaveProperty('columns');
      expect(result.columns).toBeInstanceOf(Array);
      expect(result.columns.length).toBeGreaterThan(0);
    });

    it('debería analizar tendencias con diferentes períodos', async () => {
      const periods = ['daily', 'monthly', 'yearly'];
      
      for (const period of periods) {
        const result = await mcpConnection.analyze({
          type: 'data_trends',
          table: testTable,
          options: {
            field: 'VALUE',
            period: period as 'daily' | 'monthly' | 'yearly'
          }
        });

        expect(result).toHaveProperty('table', testTable);
        expect(result).toHaveProperty('trends');
        expect(result.trends).toBeInstanceOf(Array);
      }
    });
  });

  describe('Manejo de Errores', () => {
    it('debería manejar timeouts de consulta', async () => {
      await expect(mcpConnection.query({
        sql: 'SELECT pg_sleep(10)',
        options: { timeout: 1000 }
      })).rejects.toThrow();
    });

    it('debería manejar errores de sintaxis SQL', async () => {
      await expect(mcpConnection.query({
        sql: 'SELECT * FROM tabla_inexistente'
      })).rejects.toThrow();
    });
  });
}); 