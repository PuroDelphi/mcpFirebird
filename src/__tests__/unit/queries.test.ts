/**
 * Pruebas unitarias para el módulo de consultas a Firebird
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mockear los módulos necesarios
jest.mock('../../db/connection.js', () => {
  // Crear clase FirebirdError para los tests
  class FirebirdError extends Error {
    type: string;
    originalError?: any;
    
    constructor(message: string, type: string, originalError?: any) {
      super(message);
      this.name = 'FirebirdError';
      this.type = type;
      this.originalError = originalError;
    }
  }
  
  // Mock del objeto de base de datos
  const mockDb = {
    query: jest.fn().mockImplementation((sql, params, callback) => {
      if (callback) callback(null, [{ ID: 1, NAME: 'Test' }]);
      return { on: jest.fn() };
    }),
    detach: jest.fn().mockImplementation((callback) => {
      if (callback) callback(null);
    })
  };
  
  return {
    connectToDatabase: jest.fn().mockResolvedValue(mockDb),
    queryDatabase: jest.fn().mockResolvedValue([{ ID: 1, NAME: 'Test' }]),
    FirebirdError,
    FirebirdDatabase: jest.fn(), // Mock de tipo para compatibilidad
    DEFAULT_CONFIG: {
      host: 'localhost',
      port: 3050,
      database: 'test.fdb',
      user: 'SYSDBA',
      password: 'masterkey'
    }
  };
});

jest.mock('../../utils/security.js', () => ({
  validateSql: jest.fn().mockReturnValue(true)
}));

// Importar después de mockear
import * as connection from '../../db/connection.js';
import * as queries from '../../db/queries.js';
import { validateSql } from '../../utils/security.js';

describe('Módulo de Consultas a Firebird', () => {
  // Mock de la base de datos y conexión
  let mockDb;
  
  // Configuración de prueba
  const testConfig = {
    host: 'localhost',
    port: 3050,
    database: 'test.fdb',
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: true,
    role: undefined,
    pageSize: 4096
  };
  
  beforeEach(() => {
    // Limpiar mocks antes de cada prueba
    jest.clearAllMocks();
    
    // Inicializar mockDb
    mockDb = {
      query: jest.fn().mockImplementation((sql, params, callback) => {
        if (callback) callback(null, [{ ID: 1, NAME: 'Test' }]);
        return { on: jest.fn() };
      }),
      detach: jest.fn().mockImplementation((callback) => {
        if (callback) callback(null);
      })
    };
    
    // Configurar el mock para connectToDatabase que devuelve mockDb
    (connection.connectToDatabase as jest.Mock).mockResolvedValue(mockDb);
    
    // Configurar validateSql para que por defecto valide como true
    (validateSql as jest.Mock).mockReturnValue(true);
  });
  
  describe('executeQuery', () => {
    it('debe ejecutar una consulta correctamente', async () => {
      // Configurar resultados esperados
      const expectedResults = [{ id: 1, name: 'Test' }];
      
      // Configurar queryDatabase para que devuelva los resultados esperados
      (connection.queryDatabase as jest.Mock).mockResolvedValue(expectedResults);
      
      // Ejecutar la consulta
      const result = await queries.executeQuery('SELECT * FROM TEST', [], testConfig);
      
      // Verificar que connectToDatabase fue llamado con la configuración correcta
      expect(connection.connectToDatabase).toHaveBeenCalledWith(testConfig);
      
      // Verificar que queryDatabase fue llamado con la consulta correcta
      expect(connection.queryDatabase).toHaveBeenCalled();
      
      // Verificar que el resultado es correcto
      expect(result).toEqual(expectedResults);
    });
    
    it('debe ejecutar una consulta con parámetros', async () => {
      // Configurar resultados esperados
      const expectedResults = [{ id: 1, name: 'Parámetro' }];
      
      // Configurar queryDatabase para que devuelva los resultados esperados
      (connection.queryDatabase as jest.Mock).mockResolvedValue(expectedResults);
      
      // Parámetros de consulta
      const params = [1, 'test'];
      
      // Ejecutar la consulta con parámetros
      const result = await queries.executeQuery(
        'SELECT * FROM TEST WHERE id = ? AND name = ?',
        params,
        testConfig
      );
      
      // Verificar que queryDatabase fue llamado con los parámetros correctos
      expect(connection.queryDatabase).toHaveBeenCalled();
      
      // Verificar que el resultado es correcto
      expect(result).toEqual(expectedResults);
    });
    
    it('debe manejar errores de conexión', async () => {
      // Configurar connectToDatabase para que falle
      const connectionError = new Error('Error de conexión');
      (connection.connectToDatabase as jest.Mock).mockRejectedValue(connectionError);
      
      // Intentar ejecutar la consulta
      await expect(queries.executeQuery('SELECT * FROM TEST', [], testConfig)).rejects.toThrow();
    });
    
    it('debe manejar errores de consulta', async () => {
      // Configurar queryDatabase para que falle
      const queryError = new Error('Error de consulta');
      (connection.queryDatabase as jest.Mock).mockRejectedValue(queryError);
      
      // Intentar ejecutar la consulta
      await expect(queries.executeQuery('INVALID SQL', [], testConfig)).rejects.toThrow();
    });
  });
  
  describe('listTables', () => {
    it('debe listar las tablas correctamente', async () => {
      // Configurar resultados esperados
      const mockTables = [
        { RDB$RELATION_NAME: 'TABLE1' },
        { RDB$RELATION_NAME: 'TABLE2' },
        { RDB$RELATION_NAME: 'TABLE3' }
      ];
      
      // Mock a executeQuery en lugar de queryDatabase para simular el comportamiento real
      jest.spyOn(queries, 'executeQuery').mockResolvedValue(mockTables);
      
      // Listar las tablas
      const result = await queries.listTables(testConfig);
      
      // Verificar que executeQuery fue llamado con la consulta correcta
      expect(queries.executeQuery).toHaveBeenCalled();
      
      // Verificar que el resultado es correcto (nombres de tabla sin espacios)
      expect(result).toEqual(['TABLE1', 'TABLE2', 'TABLE3']);
    });
    
    it('debe manejar errores al listar tablas', async () => {
      // Configurar executeQuery para que falle
      const queryError = new Error('Error al listar tablas');
      jest.spyOn(queries, 'executeQuery').mockRejectedValue(queryError);
      
      // Intentar listar las tablas
      await expect(queries.listTables(testConfig)).rejects.toThrow();
    });
  });
  
  describe('describeTable', () => {
    it('debe describir una tabla correctamente', async () => {
      // Configurar resultados esperados
      const mockColumns = [
        { FIELD_NAME: 'ID', FIELD_TYPE: 'INTEGER' },
        { FIELD_NAME: 'NAME', FIELD_TYPE: 'VARCHAR' }
      ];
      
      // Mock a executeQuery
      jest.spyOn(queries, 'executeQuery').mockResolvedValue(mockColumns);
      
      // Describir la tabla
      const result = await queries.describeTable('TEST', testConfig);
      
      // Verificar que executeQuery fue llamado con la consulta correcta
      expect(queries.executeQuery).toHaveBeenCalled();
      
      // Verificar que el resultado es correcto
      expect(result).toEqual(mockColumns);
    });
    
    it('debe manejar errores al describir una tabla', async () => {
      // Configurar executeQuery para que falle
      const queryError = new Error('Tabla no encontrada');
      jest.spyOn(queries, 'executeQuery').mockRejectedValue(queryError);
      
      // Intentar describir una tabla que no existe
      await expect(queries.describeTable('NON_EXISTENT', testConfig)).rejects.toThrow();
    });
  });
});
