/**
 * Database module index
 *
 * Este módulo exporta todas las funciones de base de datos,
 * utilizando las versiones wrapped que garantizan el uso de la configuración correcta.
 */

// Exportar las versiones wrapped de las funciones de consulta
export * from './wrapped-queries.js';

// Exportar otras funciones y tipos
export {
    ConfigOptions,
    DEFAULT_CONFIG,
    getGlobalConfig,
    connectToDatabase,
    queryDatabase
} from './connection.js';

export {
    getDatabases,
    getViews,
    getProcedures,
    DATABASE_DIR,
    DatabaseInfo,
    TableInfo,
    FieldInfo,
    ColumnInfo,
    QueryPerformanceResult,
    ExecutionPlanResult
} from './queries.js';

// Exportar funciones de gestión de base de datos
export * from './management.js';

// Exportar funciones de esquema
export * from './schema.js';
