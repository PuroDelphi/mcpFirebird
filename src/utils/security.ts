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
 * @param securityConfig Configuración de seguridad opcional
 * @returns true si es válido, false si es potencialmente peligroso
 */
export function validateSql(sql: string, securityConfig?: any): boolean {
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

  // Si se permite consultas inseguras, saltamos la validación
  if (securityConfig?.sql?.allowUnsafeQueries) {
    return true;
  }

  // Verificar si es una consulta a tablas del sistema
  if (sanitized.toLowerCase().includes('rdb$') ||
      sanitized.toLowerCase().includes('mon$') ||
      sanitized.toLowerCase().includes('sys.')) {

    // Si se permiten tablas del sistema
    if (securityConfig?.sql?.allowSystemTables) {
      // Si hay una lista de tablas del sistema permitidas
      if (securityConfig?.sql?.allowedSystemTables?.length > 0) {
        // Verificar si la tabla está en la lista de permitidas
        const allowedTables = securityConfig.sql.allowedSystemTables;
        const isAllowed = allowedTables.some((table: string) =>
          sanitized.toLowerCase().includes(table.toLowerCase())
        );
        if (!isAllowed) {
          return false;
        }
      }
      // Si no hay lista o la tabla está permitida, continuamos con la validación
    } else {
      // No se permiten tablas del sistema
      return false;
    }
  }

  // Verificar si es una consulta DDL (CREATE, ALTER, DROP)
  if (sanitized.toLowerCase().startsWith('create') ||
      sanitized.toLowerCase().startsWith('alter') ||
      sanitized.toLowerCase().startsWith('drop')) {

    // Si no se permiten consultas DDL
    if (!securityConfig?.sql?.allowDDL) {
      return false;
    }
  }

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