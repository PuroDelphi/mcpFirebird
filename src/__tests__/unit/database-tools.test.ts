/**
 * Pruebas unitarias para las herramientas MCP de base de datos
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mockear los módulos
jest.mock('../../db/queries.js', () => ({
  executeQuery: jest.fn(),
  listTables: jest.fn(),
  describeTable: jest.fn(),
  getFieldDescriptions: jest.fn()
}));

jest.mock('../../utils/security.js', () => ({
  validateSql: jest.fn().mockReturnValue(true)
}));

// Importar después de mockear
import * as queriesModule from '../../db/queries.js';
import * as securityModule from '../../utils/security.js';
import { setupDatabaseTools } from '../../tools/database.js';
import { FirebirdError } from '../../db/connection.js';

describe('Herramientas MCP para Base de Datos', () => {
  // Mock del servidor MCP
  const mockServer = {
    tool: jest.fn()
  };
  
  beforeEach(() => {
    // Limpiar mocks antes de cada prueba
    jest.clearAllMocks();
    
    // Configurar el comportamiento predeterminado del validador SQL
    (securityModule.validateSql as jest.Mock).mockReturnValue(true);
  });
  
  describe('setupDatabaseTools', () => {
    it('debe registrar todas las herramientas de base de datos en el servidor', () => {
      setupDatabaseTools(mockServer);
      
      // Verificar que se registraron todas las herramientas MCP específicas de Firebird
      expect(mockServer.tool).toHaveBeenCalledTimes(4);
      
      // Verificar el registro de execute-query
      expect(mockServer.tool).toHaveBeenCalledWith(
        "execute-query",
        expect.stringContaining("Firebird"),
        expect.objectContaining({
          sql: expect.any(Object)
        }),
        expect.any(Function)
      );
      
      // Verificar el registro de list-tables
      expect(mockServer.tool).toHaveBeenCalledWith(
        "list-tables",
        expect.stringContaining("Firebird"),
        expect.objectContaining({
          database: expect.any(Object)
        }),
        expect.any(Function)
      );
      
      // Verificar el registro de describe-table
      expect(mockServer.tool).toHaveBeenCalledWith(
        "describe-table",
        expect.stringContaining("Firebird"),
        expect.objectContaining({
          tableName: expect.any(Object)
        }),
        expect.any(Function)
      );
      
      // Verificar el registro de get-field-descriptions
      expect(mockServer.tool).toHaveBeenCalledWith(
        "get-field-descriptions",
        expect.stringContaining("Firebird"),
        expect.objectContaining({
          tableName: expect.any(Object)
        }),
        expect.any(Function)
      );
    });
  });
  
  describe('execute-query tool', () => {
    let executeQueryHandler: any;
    
    beforeEach(() => {
      // Registrar las herramientas y capturar los manejadores
      setupDatabaseTools(mockServer);
      // Usar conversión de tipo segura para el manejador
      const handler = mockServer.tool.mock.calls.find(call => call[0] === "execute-query")?.[3];
      if (handler) {
        executeQueryHandler = handler;
      } else {
        throw new Error("No se pudo encontrar el manejador execute-query");
      }
    });
    
    it('debe ejecutar consultas SQL válidas correctamente', async () => {
      // Configurar el mock de executeQuery para devolver resultados
      const mockResults = [{ ID: 1, NAME: 'Test Record' }];
      (queriesModule.executeQuery as jest.Mock).mockResolvedValue(mockResults);
      
      // Ejecutar la herramienta con una consulta válida
      const result = await executeQueryHandler({
        sql: 'SELECT * FROM TEST'
      });
      
      // Verificar que se valida la consulta SQL
      expect(securityModule.validateSql).toHaveBeenCalled();
      
      // Verificar que se ejecuta la consulta
      expect(queriesModule.executeQuery).toHaveBeenCalled();
      
      // Verificar la respuesta success
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('result');
    });
    
    it('debe rechazar consultas SQL potencialmente inseguras', async () => {
      // Configurar el validador para rechazar la consulta
      (securityModule.validateSql as jest.Mock).mockReturnValue(false);
      
      // Ejecutar la herramienta con una consulta insegura
      const result = await executeQueryHandler({
        sql: 'DROP TABLE USERS; --'
      });
      
      // Verificar que no se ejecuta la consulta
      expect(queriesModule.executeQuery).not.toHaveBeenCalled();
      
      // Verificar la respuesta de error
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('errorType', 'SQL_VALIDATION_ERROR');
      expect(result).toHaveProperty('suggestions');
    });
    
    it('debe manejar errores durante la ejecución de la consulta', async () => {
      // Configurar el mock para lanzar un error
      const fireError = new FirebirdError('Error de sintaxis', 'SYNTAX_ERROR');
      (queriesModule.executeQuery as jest.Mock).mockRejectedValue(fireError);
      
      // Ejecutar la herramienta
      const result = await executeQueryHandler({
        sql: 'SELECT * FRM TEST' // Error intencional
      });
      
      // Verificar la respuesta de error
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('errorType', 'SYNTAX_ERROR');
      expect(result).toHaveProperty('suggestions');
      
      // Verificar que se proporcionan sugerencias apropiadas para este error
      expect(result.suggestions).toContainEqual(expect.stringContaining('sintaxis'));
    });
  });
  
  describe('describe-table tool', () => {
    let describeTableHandler: any;
    
    beforeEach(() => {
      // Registrar las herramientas y capturar los manejadores
      setupDatabaseTools(mockServer);
      // Usar conversión de tipo segura para el manejador
      const handler = mockServer.tool.mock.calls.find(call => call[0] === "describe-table")?.[3];
      if (handler) {
        describeTableHandler = handler;
      } else {
        throw new Error("No se pudo encontrar el manejador describe-table");
      }
    });
    
    it('debe describir la estructura de una tabla correctamente', async () => {
      // Configurar el mock para describeTable
      const mockColumns = [
        { FIELD_NAME: 'ID', FIELD_TYPE: 'INTEGER', NULL_FLAG: 0 },
        { FIELD_NAME: 'NAME', FIELD_TYPE: 'VARCHAR', NULL_FLAG: 1 }
      ];
      (queriesModule.describeTable as jest.Mock).mockResolvedValue(mockColumns);
      
      // Ejecutar la herramienta
      const result = await describeTableHandler({
        tableName: 'TEST'
      });
      
      // Verificar que se describe la tabla
      expect(queriesModule.describeTable).toHaveBeenCalled();
      
      // Verificar la respuesta success
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('columns', mockColumns);
      expect(result).toHaveProperty('tableName', 'TEST');
    });
    
    it('debe manejar errores cuando la tabla no existe', async () => {
      // Configurar el mock para lanzar un error
      const fireError = new FirebirdError('Tabla no encontrada', 'OBJECT_NOT_FOUND');
      (queriesModule.describeTable as jest.Mock).mockRejectedValue(fireError);
      
      // Ejecutar la herramienta
      const result = await describeTableHandler({
        tableName: 'NON_EXISTENT'
      });
      
      // Verificar la respuesta de error
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('errorType', 'OBJECT_NOT_FOUND');
      expect(result).toHaveProperty('suggestions');
      
      // Verificar que se proporcionan sugerencias apropiadas para este error
      expect(result.suggestions).toContainEqual(expect.stringContaining('tabla'));
    });
  });
});
