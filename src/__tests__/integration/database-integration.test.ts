/**
 * Pruebas de integración para los módulos de base de datos Firebird
 * Estas pruebas verifican la integración correcta entre los módulos de conexión, consultas y herramientas
 */
import { describe, it, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { connectToDatabase, queryDatabase, FirebirdError } from '../../db/connection.js';
import { executeQuery, getTables, getFieldDescriptions } from '../../db/queries.js';
import { setupDatabaseTools } from '../../tools/database.js';
import { validateSql } from '../../utils/security.js';

// Definir tipo para el mock de Firebird
interface MockFirebirdDB {
  query: jest.Mock;
  detach: jest.Mock;
}

// Mockear node-firebird ya que no queremos conectar a una base de datos real durante las pruebas
jest.mock('node-firebird', () => ({
  attach: jest.fn()
}));

// Crear un mock específico para validateSql
jest.mock('../../utils/security.js', () => ({
  validateSql: jest.fn(() => true)
}));

// Importar el módulo de firebird sin usar await a nivel de módulo
import * as firebird from 'node-firebird';

// Tipo para las herramientas del servidor
interface ServerTool {
  (params: any): Promise<any>;
}

interface MockServer {
  tool: jest.Mock;
  tools: Record<string, ServerTool>;
}

describe('Integración de Módulos de Base de Datos', () => {
  // Datos mock para simular una base de datos
  const mockTables = [
    { NAME: 'CUSTOMERS' },
    { NAME: 'PRODUCTS' },
    { NAME: 'ORDERS' }
  ];
  
  const mockCustomers = [
    { ID: 1, NAME: 'Cliente A', EMAIL: 'clienteA@example.com' },
    { ID: 2, NAME: 'Cliente B', EMAIL: 'clienteB@example.com' }
  ];
  
  const mockFields = [
    { FIELD_NAME: 'ID', DESCRIPTION: 'Identificador único del cliente' },
    { FIELD_NAME: 'NAME', DESCRIPTION: 'Nombre completo del cliente' },
    { FIELD_NAME: 'EMAIL', DESCRIPTION: 'Correo electrónico del cliente' }
  ];
  
  // Mock del servidor MCP para capturar las herramientas
  const mockServer: MockServer = {
    tool: jest.fn(),
    tools: {}
  };
  
  beforeAll(() => {
    // Configurar el mock de Firebird para simular la conexión
    const mockDb: MockFirebirdDB = {
      query: jest.fn(),
      detach: jest.fn()
    };
    
    (firebird.attach as jest.Mock).mockImplementation((config: any, callback: any) => {
      // Simular conexión exitosa
      callback(null, mockDb);
    });
    
    // Setup herramientas MCP y capturar los handlers
    setupDatabaseTools(mockServer);
    
    // Almacenar los handlers de las herramientas para usarlos en las pruebas
    mockServer.tool.mock.calls.forEach(call => {
      const [name, description, schema, handler] = call;
      mockServer.tools[name as string] = handler as ServerTool;
    });
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Configurar el mock de query para poder simular diferentes respuestas
    const mockDb = (firebird.attach as jest.Mock).mock.results[0]?.value as MockFirebirdDB;
    if (mockDb) {
      mockDb.query.mockImplementation((sql: any, params: any, callback: any) => {
        // Simular diferentes respuestas según la consulta
        if (sql.includes('RDB$RELATION_NAME') && sql.includes('RDB$SYSTEM_FLAG = 0')) {
          callback(null, mockTables);
        } else if (sql.includes('CUSTOMERS')) {
          callback(null, mockCustomers);
        } else if (sql.includes('RDB$FIELD_NAME') && sql.includes('RDB$RELATION_FIELDS')) {
          callback(null, mockFields);
        } else {
          callback(null, []);
        }
      });
    }
  });
  
  describe('Flujo completo de consulta a la base de datos', () => {
    it('debe listar tablas y consultar datos correctamente', async () => {
      // 1. Obtener las tablas usando el módulo de consultas
      const tables = await getTables();
      
      // Verificar que se devuelven las tablas en el formato correcto
      expect(tables).toHaveLength(3);
      expect(tables[0]).toHaveProperty('name', 'CUSTOMERS');
      expect(tables[0]).toHaveProperty('uri', 'firebird://table/CUSTOMERS');
      
      // 2. Consultar datos de una tabla específica
      const customers = await executeQuery('SELECT * FROM CUSTOMERS');
      
      // Verificar que se devuelven los datos correctos
      expect(customers).toHaveLength(2);
      expect(customers[0]).toHaveProperty('ID', 1);
      expect(customers[0]).toHaveProperty('NAME', 'Cliente A');
      
      // 3. Obtener descripciones de campos
      const fields = await getFieldDescriptions('CUSTOMERS');
      
      // Verificar que se devuelven las descripciones correctas
      expect(fields).toHaveLength(3);
      expect(fields[0]).toHaveProperty('name', 'ID');
      expect(fields[0]).toHaveProperty('description', 'Identificador único del cliente');
    });
  });
  
  describe('Integración de herramientas MCP con módulos de base de datos', () => {
    it('La herramienta execute-query debe interactuar correctamente con el módulo de consultas', async () => {
      // Usar la herramienta MCP para ejecutar una consulta
      const result = await mockServer.tools['execute-query']({
        sql: 'SELECT * FROM CUSTOMERS'
      });
      
      // Verificar que la respuesta tiene el formato correcto
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('result');
      expect(result.result).toHaveLength(2);
      
      // Verificar que los datos son los esperados
      expect(result.result[0]).toHaveProperty('ID', 1);
      expect(result.result[0]).toHaveProperty('NAME', 'Cliente A');
    });
    
    it('La herramienta list-tables debe interactuar correctamente con el módulo de consultas', async () => {
      // Usar la herramienta MCP para listar tablas
      const result = await mockServer.tools['list-tables']({});
      
      // Verificar que la respuesta tiene el formato correcto
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('tables');
      expect(result.tables).toHaveLength(3);
      
      // Verificar que las tablas son las esperadas
      expect(result.tables[0]).toHaveProperty('name', 'CUSTOMERS');
      expect(result.tables[0]).toHaveProperty('uri', 'firebird://table/CUSTOMERS');
    });
    
    it('La herramienta get-field-descriptions debe interactuar correctamente', async () => {
      // Usar la herramienta MCP para obtener descripciones de campos
      const result = await mockServer.tools['get-field-descriptions']({
        tableName: 'CUSTOMERS'
      });
      
      // Verificar que la respuesta tiene el formato correcto
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('descriptions');
      expect(result.descriptions).toHaveLength(3);
      
      // Verificar que las descripciones son las esperadas
      expect(result.descriptions[0]).toHaveProperty('name', 'ID');
      expect(result.descriptions[0]).toHaveProperty('description', 'Identificador único del cliente');
    });
  });
  
  describe('Manejo de errores integrado', () => {
    it('debe propagar y categorizar errores correctamente a través de las capas', async () => {
      // Configurar el mock de Firebird para simular un error de conexión
      (firebird.attach as jest.Mock).mockImplementationOnce((config: any, callback: any) => {
        callback(new Error('ECONNREFUSED'), null);
      });
      
      // Intentar listar tablas
      try {
        await getTables();
        // Si llegamos aquí, la prueba debe fallar
        expect(true).toBe(false); // Esta línea no debería ejecutarse
      } catch (error) {
        // Verificar que el error es un FirebirdError
        expect(error).toBeInstanceOf(FirebirdError);
        expect(error).toHaveProperty('type', 'CONNECTION_REFUSED');
      }
      
      // Verificar que la herramienta MCP maneja el error correctamente
      const result = await mockServer.tools['list-tables']({});
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('errorType', 'CONNECTION_REFUSED');
    });
    
    it('debe rechazar consultas SQL inseguras en todas las capas', async () => {
      // Configurar el validador SQL para rechazar la consulta
      const securityModule = await import('../../utils/security.js');
      (securityModule.validateSql as jest.Mock).mockReturnValueOnce(false);
      
      // Usar la herramienta MCP con una consulta insegura
      const result = await mockServer.tools['execute-query']({
        sql: 'DROP TABLE USERS; --'
      });
      
      // Verificar que la respuesta tiene el formato de error correcto
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('errorType', 'SQL_VALIDATION_ERROR');
      
      // Verificar que se proporcionan sugerencias apropiadas
      expect(result.suggestions).toContainEqual(expect.stringContaining('seguridad'));
    });
  });
});
