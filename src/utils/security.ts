import { MCPConfig, MCPQuery } from '../types.js';

export function validateConfig(config: MCPConfig): MCPConfig {
  if (!config.host) {
    throw new Error('Host is required');
  }
  if (!config.port) {
    throw new Error('Port is required');
  }
  if (!config.database) {
    throw new Error('Database path is required');
  }
  if (!config.user) {
    throw new Error('User is required');
  }
  if (!config.password) {
    throw new Error('Password is required');
  }
  return config;
}

export function sanitizeInput<T>(input: T): T {
  if (typeof input === 'string') {
    return input.trim() as T;
  }
  if (Array.isArray(input)) {
    return input.map(item => sanitizeInput(item)) as T;
  }
  if (typeof input === 'object' && input !== null) {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, sanitizeInput(value)])
    ) as T;
  }
  return input;
}

/**
 * Valida y sanitiza parámetros de consultas SQL
 * @param {string | { table?: string, sql?: string }} input - String SQL o objeto con nombre de tabla o consulta SQL
 * @returns {boolean} Verdadero si la entrada es válida
 * @throws {Error} Si la entrada contiene caracteres o patrones peligrosos
 */
export function validateSql(input: string | { table?: string, sql?: string }): boolean {
  // Si es un objeto, procesamos cada propiedad relevante
  if (typeof input === 'object') {
    if (input.table) {
      // Validar nombre de tabla
      const tableName = input.table.trim();
      if (!tableName || tableName.length === 0) {
        throw new Error('Nombre de tabla vacío');
      }
      
      // Verificar caracteres no permitidos en nombres de tabla
      const tableNameRegex = /^[a-zA-Z0-9_]+$/;
      if (!tableNameRegex.test(tableName)) {
        throw new Error(`Nombre de tabla inválido: ${tableName}. Solo se permiten letras, números y guiones bajos.`);
      }
    }
    
    if (input.sql) {
      // Validar consulta SQL
      return validateSql(input.sql);
    }
    
    return true;
  }
  
  // Validación de cadena SQL
  const sql = input.trim();
  if (!sql || sql.length === 0) {
    throw new Error('Consulta SQL vacía');
  }
  
  // Patrones de SQL peligrosos
  const dangerousPatterns = [
    /--/,              // Comentarios de línea
    /\/\*/,            // Comentarios de bloque inicio
    /\*\//,            // Comentarios de bloque fin
    /;.*;/,            // Múltiples consultas
    /xp_cmdshell/i,    // Comandos del sistema (específico de SQL Server, pero buena práctica)
    /EXECUTE\s+sp_/i,  // Procedimientos del sistema
    /INTO\s+OUTFILE/i, // Escritura de archivos
    /UNION\s+ALL\s+SELECT/i, // Ataques de Unión típicos
  ];
  
  // Verificar patrones peligrosos
  for (const pattern of dangerousPatterns) {
    if (pattern.test(sql)) {
      throw new Error(`Consulta SQL potencialmente peligrosa detectada: ${sql}`);
    }
  }
  
  return true;
}

export function validateQuery(query: MCPQuery): MCPQuery {
  if (!query.sql) {
    throw new Error('SQL query is required');
  }
  return {
    sql: query.sql.trim(),
    params: query.params?.map(param => sanitizeInput(param)),
    context: query.context ? {
      description: query.context.description?.trim(),
      constraints: query.context.constraints?.map(c => c.trim()),
      preferences: query.context.preferences?.map((p: string) => p.trim())
    } : undefined
  };
}