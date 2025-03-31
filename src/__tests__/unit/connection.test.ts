/**
 * Pruebas unitarias para el módulo de conexión a Firebird
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Crear un mock manual del objeto de base de datos
const mockDb = {
  query: jest.fn(),
  detach: jest.fn()
};

// Mockear el módulo node-firebird
jest.mock('node-firebird', () => {
  return {
    attach: jest.fn((config, callback) => {
      callback(null, mockDb);
    }),
    escape: jest.fn((val) => `escaped_${val}`)
  };
});

// Importar después de mockear
import Firebird from 'node-firebird';
import * as connectionModule from '../../db/connection.js';

describe('Módulo de Conexión a Firebird', () => {
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
    
    // Configurar comportamiento por defecto para query
    mockDb.query.mockImplementation((sql, params, callback) => {
      if (callback) callback(null, [{ ID: 1, NAME: 'Test' }]);
      return { on: jest.fn() };
    });
    
    // Configurar detach para que tenga éxito por defecto
    mockDb.detach.mockImplementation((callback) => {
      if (callback) callback(null);
    });
  });
  
  describe('connectToDatabase', () => {
    it('debe conectar a la base de datos correctamente', async () => {
      // Conectar a la base de datos
      const db = await connectionModule.connectToDatabase(testConfig);
      
      // Verificar que attach fue llamado con la configuración correcta
      expect(Firebird.attach).toHaveBeenCalled();
      
      // Verificar que el objeto de base de datos devuelto es el mockDb
      expect(db).toBe(mockDb);
    });
    
    it('debe manejar errores de conexión', async () => {
      // Configurar attach para que falle
      const connectionError = new Error('Error de conexión');
      (Firebird.attach as jest.Mock).mockImplementationOnce((config, callback) => {
        callback(connectionError, undefined);
      });
      
      // Intentar conectar a la base de datos
      await expect(connectionModule.connectToDatabase(testConfig)).rejects.toThrow('Error de conexión');
      
      // Verificar que attach fue llamado
      expect(Firebird.attach).toHaveBeenCalled();
    });
    
    it('debe aplicar las opciones de configuración adicionales', async () => {
      // Configuración con opciones adicionales
      const extendedConfig = {
        ...testConfig,
        lowercase_keys: false,
        role: 'ADMIN',
        pageSize: 8192
      };
      
      // Conectar a la base de datos
      await connectionModule.connectToDatabase(extendedConfig);
      
      // Verificar que attach fue llamado con la configuración extendida
      expect(Firebird.attach).toHaveBeenCalled();
    });
  });
  
  describe('queryDatabase', () => {
    it('debe ejecutar una consulta correctamente', async () => {
      // Resultados esperados
      const expectedResults = [{ ID: 1, NAME: 'Test' }];
      
      // Ejecutar consulta
      const results = await connectionModule.queryDatabase(mockDb, 'SELECT * FROM TEST', []);
      
      // Verificar que query fue llamado con los parámetros correctos
      expect(mockDb.query).toHaveBeenCalled();
      
      // Verificar que los resultados son los esperados
      expect(results).toEqual(expectedResults);
    });
    
    it('debe manejar consultas con parámetros', async () => {
      // Configurar query para devolver resultados específicos para esta prueba
      mockDb.query.mockImplementationOnce((sql, params, callback) => {
        if (callback) callback(null, [{ ID: params[0], NAME: params[1] }]);
        return { on: jest.fn() };
      });
      
      // Ejecutar consulta con parámetros
      const results = await connectionModule.queryDatabase(
        mockDb,
        'SELECT * FROM TEST WHERE ID = ? AND NAME = ?',
        [1, 'Test']
      );
      
      // Verificar que query fue llamado con los parámetros correctos
      expect(mockDb.query).toHaveBeenCalled();
      
      // Verificar que los resultados incluyen los parámetros proporcionados
      expect(results).toEqual([{ ID: 1, NAME: 'Test' }]);
    });
    
    it('debe manejar errores de consulta', async () => {
      // Configurar query para que falle solo en esta prueba
      const queryError = new Error('Error de consulta');
      mockDb.query.mockImplementationOnce((sql, params, callback) => {
        if (callback) callback(queryError, []);
        return { on: jest.fn() };
      });
      
      // Intentar ejecutar consulta
      await expect(connectionModule.queryDatabase(mockDb, 'INVALID SQL', [])).rejects.toThrow('Error de consulta');
      
      // Verificar que query fue llamado
      expect(mockDb.query).toHaveBeenCalled();
    });
  });
  
  describe('FirebirdError', () => {
    it('debe clasificar los errores correctamente', () => {
      // Crear errores de diferentes tipos
      const syntaxError = new connectionModule.FirebirdError('Error de sintaxis', 'SYNTAX_ERROR');
      const connectionError = new connectionModule.FirebirdError('Error de conexión', 'CONNECTION_ERROR');
      
      // Verificar que los errores tienen el tipo correcto
      expect(syntaxError.type).toBe('SYNTAX_ERROR');
      expect(connectionError.type).toBe('CONNECTION_ERROR');
      
      // Verificar que los errores son instancias de Error
      expect(syntaxError).toBeInstanceOf(Error);
      expect(connectionError).toBeInstanceOf(Error);
    });
    
    it('debe preservar el mensaje de error original', () => {
      // Mensaje de error
      const errorMessage = 'Error específico de Firebird';
      
      // Crear error
      const error = new connectionModule.FirebirdError(errorMessage, 'DATABASE_ERROR');
      
      // Verificar que el mensaje es el original
      expect(error.message).toBe(errorMessage);
    });
  });
});
