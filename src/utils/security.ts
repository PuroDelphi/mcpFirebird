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
      preferences: query.context.preferences?.map(p => p.trim())
    } : undefined
  };
}

/**
 * Valida una consulta SQL o nombre de tabla/campo para prevenir inyección SQL
 * @param sql Consulta SQL o nombre de tabla/campo a validar
 * @returns true si es válido, false si es potencialmente peligroso
 */
export function validateSql(sql: string): boolean {
  if (!sql) return false;
  
  const sanitized = sql.trim();
  
  // Lista de palabras clave o patrones que podrían indicar un intento de inyección SQL
  const dangerousPatterns = [
    /;\s*DROP\s+/i,
    /;\s*DELETE\s+/i, 
    /;\s*UPDATE\s+/i,
    /;\s*INSERT\s+/i,
    /;\s*ALTER\s+/i,
    /;\s*CREATE\s+/i,
    /UNION\s+ALL\s+SELECT/i,
    /UNION\s+SELECT/i,
    /--/,         // Comentarios SQL
    /\/\*/,       // Comentarios de bloque
    /xp_cmdshell/i, // Procedimientos almacenados peligrosos
    /exec\s+master/i,
    /exec\s+xp_/i,
    /INTO\s+OUTFILE/i,
    /INTO\s+DUMPFILE/i
  ];
  
  // Verificamos si la consulta contiene patrones peligrosos
  for (const pattern of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      return false;
    }
  }
  
  // Verificar el balance de comillas y paréntesis para consultas completas
  // Solo para consultas, no para nombres de tablas/campos
  if (sanitized.toLowerCase().startsWith('select') || 
      sanitized.toLowerCase().startsWith('update') || 
      sanitized.toLowerCase().startsWith('delete') || 
      sanitized.toLowerCase().startsWith('insert')) {
    
    const singleQuotes = (sanitized.match(/'/g) || []).length;
    const doubleQuotes = (sanitized.match(/"/g) || []).length;
    const openParens = (sanitized.match(/\(/g) || []).length;
    const closeParens = (sanitized.match(/\)/g) || []).length;
    
    // Verificar que las comillas y paréntesis estén balanceados
    if (singleQuotes % 2 !== 0 || 
        doubleQuotes % 2 !== 0 || 
        openParens !== closeParens) {
      return false;
    }
  }
  
  return true;
}