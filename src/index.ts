#!/usr/bin/env node

// IMPORTANTE: Interceptar TODOS los métodos de console antes de cualquier import
// Esto es crítico para evitar que cualquier librería escriba a stdout
// Sobrescribir inmediatamente los métodos de console para que todo vaya a stderr
console.log = function(...args) {
    process.stderr.write('[LOG] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.info = function(...args) {
    process.stderr.write('[INFO] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.warn = function(...args) {
    process.stderr.write('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.error = function(...args) {
    process.stderr.write('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};
console.debug = function(...args) {
    process.stderr.write('[DEBUG] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n');
};

// Nota importante: Usamos .js aquí aunque el archivo es .ts
// porque TypeScript los compila a .js y las importaciones en ESM 
// deben incluir la extensión correcta
import './utils/stdout-guard.js';

// Importaciones básicas
import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, extname } from 'path';
import { z } from 'zod';
import Firebird from 'node-firebird';
import { createLogger } from './utils/logger.js';
import { validateSql } from './utils/security.js';

// Manejar el comando --version antes de iniciar el servidor
if (process.argv.includes('--version')) {
    try {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
        process.stderr.write(packageJson.version + "\n");
        process.exit(0);
    } catch (error) {
        process.stderr.write(`Error al leer la versión: ${error}\n`);
        process.exit(1);
    }
}

// Configuración de logs
const logger = createLogger('mcp-firebird');

// Iniciamos el servidor MCP Firebird
logger.info('Iniciando servidor MCP Firebird...');
process.stderr.write("[INIT] Iniciando servidor MCP Firebird...\n");

// Definir la configuración del pool de conexiones para Firebird
const DEFAULT_DATABASE_PATH = process.env.FIREBIRD_DATABASE || join(process.cwd(), 'database', 'sample.fdb');
const DATABASE_DIR = process.env.FIREBIRD_DATABASE_DIR || join(process.cwd(), 'database');

// Configuración predeterminada para la conexión a Firebird
const DEFAULT_CONFIG = {
    host: process.env.FIREBIRD_HOST || '127.0.0.1',
    port: process.env.FIREBIRD_PORT ? parseInt(process.env.FIREBIRD_PORT) : 3050,
    database: DEFAULT_DATABASE_PATH,
    user: process.env.FIREBIRD_USER || 'SYSDBA',
    password: process.env.FIREBIRD_PASSWORD || 'masterkey',
    role: process.env.FIREBIRD_ROLE || undefined,
    lowercase_keys: false,
    pageSize: 4096,
    timeout: 5000
};

// Cache de metadatos para evitar consultas repetitivas
const metadataCache = {
    tables: new Map(),
    procedures: new Map(),
    views: new Map(),
    schemas: new Map()
};

// Conectar a la base de datos Firebird
const connectToDatabase = async (config = DEFAULT_CONFIG): Promise<any> => {
    return new Promise((resolve, reject) => {
        const fullConfig = {
            ...config,
            lowercase_keys: false
        };
        
        Firebird.attach(fullConfig, (err: Error | null, db: any) => {
            if (err) {
                logger.error(`Error conectando a la base de datos: ${err.message}`);
                reject(err);
                return;
            }
            resolve(db);
        });
    });
};

// Ejecutar consulta a la base de datos
const queryDatabase = async (db: any, sql: string, params: any[] = []): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err: Error | null, result: any[]) => {
            if (err) {
                logger.error(`Error en consulta: ${err.message}`);
                reject(err);
                return;
            }
            resolve(result);
        });
    });
};

// Función para ejecutar consultas y cerrar automáticamente la conexión
const executeQuery = async (sql: string, params: any[] = [], config = DEFAULT_CONFIG) => {
    let db: any;
    try {
        db = await connectToDatabase(config);
        const result = await queryDatabase(db, sql, params);
        return result;
    } catch (error) {
        logger.error(`Error ejecutando consulta: ${error}`);
        throw error;
    } finally {
        if (db) {
            db.detach();
        }
    }
};

// Función para listar bases de datos disponibles
const getDatabases = () => {
    try {
        if (!existsSync(DATABASE_DIR)) {
            return [];
        }
        
        return readdirSync(DATABASE_DIR)
            .filter(file => ['.fdb', '.gdb'].includes(extname(file).toLowerCase()))
            .map(file => ({
                name: file,
                path: join(DATABASE_DIR, file),
                uri: `firebird://database/${file}`
            }));
    } catch (error) {
        logger.error(`Error al listar bases de datos: ${error}`);
        return [];
    }
};

// Obtener el esquema de una tabla
const getTableSchema = async (tableName: string, config = DEFAULT_CONFIG) => {
    try {
        if (!validateSql(tableName)) {
            throw new Error(`Nombre de tabla inválido: ${tableName}`);
        }

        // Obtener columnas
        const columnsSql = `
            SELECT
                r.RDB$FIELD_NAME as COLUMN_NAME,
                f.RDB$FIELD_TYPE as FIELD_TYPE,
                f.RDB$FIELD_SUB_TYPE as FIELD_SUB_TYPE,
                f.RDB$FIELD_LENGTH as FIELD_LENGTH,
                f.RDB$FIELD_PRECISION as FIELD_PRECISION,
                f.RDB$FIELD_SCALE as FIELD_SCALE,
                r.RDB$NULL_FLAG as NULL_FLAG,
                r.RDB$DEFAULT_SOURCE as DEFAULT_SOURCE,
                r.RDB$DESCRIPTION as DESCRIPTION
            FROM RDB$RELATION_FIELDS r
            JOIN RDB$FIELDS f ON r.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
            WHERE r.RDB$RELATION_NAME = ?
            ORDER BY r.RDB$FIELD_POSITION
        `;
        
        const columns = await executeQuery(columnsSql, [tableName], config);
        
        // Obtener primary keys
        const pkSql = `
            SELECT
                sg.RDB$FIELD_NAME as COLUMN_NAME
            FROM RDB$INDICES ix
            JOIN RDB$INDEX_SEGMENTS sg ON ix.RDB$INDEX_NAME = sg.RDB$INDEX_NAME
            WHERE ix.RDB$RELATION_NAME = ?
            AND ix.RDB$UNIQUE_FLAG = 1
            AND ix.RDB$SYSTEM_FLAG = 1
        `;
        
        const primaryKeys = await executeQuery(pkSql, [tableName], config);
        const pkColumns = primaryKeys.map((pk: any) => pk.COLUMN_NAME?.trim());
        
        // Obtener foreign keys
        const fkSql = `
            SELECT
                rc.RDB$CONSTRAINT_NAME as CONSTRAINT_NAME,
                sg.RDB$FIELD_NAME as COLUMN_NAME,
                ix2.RDB$RELATION_NAME as REFERENCED_TABLE,
                sg2.RDB$FIELD_NAME as REFERENCED_COLUMN
            FROM RDB$RELATION_CONSTRAINTS rc
            JOIN RDB$INDEX_SEGMENTS sg ON rc.RDB$INDEX_NAME = sg.RDB$INDEX_NAME
            JOIN RDB$REF_CONSTRAINTS refc ON rc.RDB$CONSTRAINT_NAME = refc.RDB$CONSTRAINT_NAME
            JOIN RDB$RELATION_CONSTRAINTS rc2 ON refc.RDB$CONST_NAME_UQ = rc2.RDB$CONSTRAINT_NAME
            JOIN RDB$INDEX_SEGMENTS sg2 ON rc2.RDB$INDEX_NAME = sg2.RDB$INDEX_NAME
            JOIN RDB$INDICES ix ON rc.RDB$INDEX_NAME = ix.RDB$INDEX_NAME
            JOIN RDB$INDICES ix2 ON rc2.RDB$INDEX_NAME = ix2.RDB$INDEX_NAME
            WHERE rc.RDB$RELATION_NAME = ?
            AND rc.RDB$CONSTRAINT_TYPE = 'FOREIGN KEY'
        `;
        
        const foreignKeys = await executeQuery(fkSql, [tableName], config);
        
        // Mappear los tipos de Firebird a tipos más legibles
        const processedColumns = columns.map((col: any) => {
            const fieldType = col.FIELD_TYPE;
            const subType = col.FIELD_SUB_TYPE;
            
            let dataType = 'UNKNOWN';
            
            // Mapeo básico de tipos
            if (fieldType === 7) {
                if (subType === 1) dataType = 'NUMERIC';
                else if (subType === 2) dataType = 'DECIMAL';
                else dataType = 'SMALLINT';
            } else if (fieldType === 8) {
                if (subType === 1) dataType = 'NUMERIC';
                else if (subType === 2) dataType = 'DECIMAL';
                else dataType = 'INTEGER';
            } else if (fieldType === 16) {
                if (subType === 1) dataType = 'NUMERIC';
                else if (subType === 2) dataType = 'DECIMAL';
                else dataType = 'BIGINT';
            } else if (fieldType === 10) {
                dataType = 'FLOAT';
            } else if (fieldType === 27) {
                dataType = 'DOUBLE PRECISION';
            } else if (fieldType === 12) {
                dataType = 'DATE';
            } else if (fieldType === 13) {
                dataType = 'TIME';
            } else if (fieldType === 35) {
                dataType = 'TIMESTAMP';
            } else if (fieldType === 14) {
                dataType = 'CHAR';
            } else if (fieldType === 37) {
                dataType = 'VARCHAR';
            } else if (fieldType === 261) {
                if (subType === 1) dataType = 'BLOB SUB_TYPE TEXT';
                else dataType = 'BLOB';
            }
            
            return {
                name: col.COLUMN_NAME?.trim(),
                type: dataType,
                length: col.FIELD_LENGTH,
                precision: col.FIELD_PRECISION,
                scale: col.FIELD_SCALE ? Math.abs(col.FIELD_SCALE) : 0,
                nullable: !col.NULL_FLAG,
                defaultValue: col.DEFAULT_SOURCE?.trim(),
                description: col.DESCRIPTION?.trim(),
                isPrimaryKey: pkColumns.includes(col.COLUMN_NAME?.trim())
            };
        });
        
        // Procesar foreign keys
        const processedFKs = foreignKeys.map((fk: any) => ({
            constraintName: fk.CONSTRAINT_NAME?.trim(),
            column: fk.COLUMN_NAME?.trim(),
            referencedTable: fk.REFERENCED_TABLE?.trim(),
            referencedColumn: fk.REFERENCED_COLUMN?.trim()
        }));
        
        return {
            tableName: tableName.trim(),
            columns: processedColumns,
            primaryKeys: pkColumns,
            foreignKeys: processedFKs
        };
    } catch (error) {
        logger.error(`Error obteniendo esquema de tabla ${tableName}: ${error}`);
        throw error;
    }
};

// Función para obtener descripciones de campos de una tabla
const getFieldDescriptions = async (tableName: string, config = DEFAULT_CONFIG) => {
    try {
        if (!validateSql(tableName)) {
            throw new Error(`Nombre de tabla inválido: ${tableName}`);
        }

        const sql = `
            SELECT 
                RDB$FIELD_NAME as FIELD_NAME, 
                RDB$DESCRIPTION as DESCRIPTION
            FROM 
                RDB$RELATION_FIELDS 
            WHERE 
                RDB$RELATION_NAME = ?
            ORDER BY 
                RDB$FIELD_POSITION
        `;
        
        const result = await executeQuery(sql, [tableName], config);
        
        return result.map((row: any) => ({
            fieldName: row.FIELD_NAME?.trim(),
            description: row.DESCRIPTION?.trim() || null
        }));
    } catch (error) {
        logger.error(`Error obteniendo descripciones de campos para ${tableName}: ${error}`);
        throw error;
    }
};

// Función para obtener todas las tablas de la base de datos
const getTables = async (config = DEFAULT_CONFIG) => {
    const sql = `
        SELECT 
            rdb$relation_name as table_name,
            rdb$system_flag as system_flag,
            rdb$relation_type as relation_type
        FROM rdb$relations
        WHERE rdb$relation_type = 0 
        AND (rdb$system_flag = 0 OR rdb$system_flag IS NULL)
        ORDER BY rdb$relation_name
    `;
    
    const result = await executeQuery(sql, [], config);
    return result.map((row: any) => ({
        name: row.TABLE_NAME.trim(),
        uri: `firebird://table/${row.TABLE_NAME.trim()}`
    }));
};

// Función para obtener todas las vistas de la base de datos
const getViews = async (config = DEFAULT_CONFIG) => {
    const sql = `
        SELECT 
            rdb$relation_name as view_name,
            rdb$system_flag as system_flag,
            rdb$relation_type as relation_type
        FROM rdb$relations
        WHERE rdb$relation_type = 1 
        AND (rdb$system_flag = 0 OR rdb$system_flag IS NULL)
        ORDER BY rdb$relation_name
    `;
    
    const result = await executeQuery(sql, [], config);
    return result.map((row: any) => ({
        name: row.VIEW_NAME.trim(),
        uri: `firebird://view/${row.VIEW_NAME.trim()}`
    }));
};

// Función para obtener todos los procedimientos almacenados
const getProcedures = async (config = DEFAULT_CONFIG) => {
    const sql = `
        SELECT
            rdb$procedure_name as procedure_name,
            rdb$system_flag as system_flag
        FROM rdb$procedures
        WHERE rdb$system_flag = 0 OR rdb$system_flag IS NULL
        ORDER BY rdb$procedure_name
    `;
    
    const result = await executeQuery(sql, [], config);
    return result.map((row: any) => ({
        name: row.PROCEDURE_NAME.trim(),
        uri: `firebird://procedure/${row.PROCEDURE_NAME.trim()}`
    }));
};

import('@modelcontextprotocol/sdk/server/mcp.js').then(async serverModule => {
    // Importación de transporte STDIO
    const stdioModule = await import('@modelcontextprotocol/sdk/server/stdio.js');
    
    try {
        // Crear instancia del servidor
        const server = new serverModule.McpServer({
            name: 'Firebird MCP',
            version: '1.0.0',
            description: 'Servidor MCP para bases de datos Firebird SQL'
        });
        
        // Crear transporte STDIO
        const transport = new stdioModule.StdioServerTransport();
        process.stderr.write("[INIT] Transporte STDIO creado\n");
        
        // 1. Definir recursos para acceder a la información de la base de datos
        
        // Recurso para listar bases de datos
        server.resource(
            "databases",
            "firebird://databases",
            async () => {
                logger.info('Accediendo al listado de bases de datos');
                const databases = getDatabases();
                return {
                    contents: [{
                        uri: "firebird://databases",
                        text: JSON.stringify(databases, null, 2)
                    }]
                };
            }
        );
        
        // Recurso para listar tablas de la base de datos
        server.resource(
            "tables",
            "firebird://tables",
            async () => {
                logger.info('Accediendo al listado de tablas');
                try {
                    const tables = await getTables();
                    return {
                        contents: [{
                            uri: "firebird://tables",
                            text: JSON.stringify(tables, null, 2)
                        }]
                    };
                } catch (error) {
                    logger.error(`Error al listar tablas: ${error}`);
                    return {
                        contents: [{
                            uri: "firebird://tables",
                            text: JSON.stringify({ error: "Error al obtener las tablas", message: String(error) }, null, 2)
                        }]
                    };
                }
            }
        );
        
        // Recurso para listar vistas
        server.resource(
            "views",
            "firebird://views",
            async () => {
                logger.info('Accediendo al listado de vistas');
                try {
                    const views = await getViews();
                    return {
                        contents: [{
                            uri: "firebird://views",
                            text: JSON.stringify(views, null, 2)
                        }]
                    };
                } catch (error) {
                    logger.error(`Error al listar vistas: ${error}`);
                    return {
                        contents: [{
                            uri: "firebird://views",
                            text: JSON.stringify({ error: "Error al obtener las vistas", message: String(error) }, null, 2)
                        }]
                    };
                }
            }
        );
        
        // Recurso para listar procedimientos almacenados
        server.resource(
            "procedures",
            "firebird://procedures",
            async () => {
                logger.info('Accediendo al listado de procedimientos');
                try {
                    const procedures = await getProcedures();
                    return {
                        contents: [{
                            uri: "firebird://procedures",
                            text: JSON.stringify(procedures, null, 2)
                        }]
                    };
                } catch (error) {
                    logger.error(`Error al listar procedimientos: ${error}`);
                    return {
                        contents: [{
                            uri: "firebird://procedures",
                            text: JSON.stringify({ error: "Error al obtener los procedimientos", message: String(error) }, null, 2)
                        }]
                    };
                }
            }
        );
        
        // Recurso para obtener descripciones de campos
        server.resource(
            "field-descriptions",
            new serverModule.ResourceTemplate("firebird://table/{tableName}/field-descriptions", { list: undefined }),
            async (uri, { tableName }) => {
                logger.info(`Accediendo a las descripciones de campos de la tabla: ${tableName}`);
                try {
                    // Validar el nombre de la tabla para prevenir inyección SQL
                    if (typeof tableName !== 'string' || !validateSql(tableName)) {
                        throw new Error(`Nombre de tabla inválido: ${tableName}`);
                    }
                    
                    const fieldDescriptions = await getFieldDescriptions(tableName);
                    return {
                        contents: [{
                            uri: uri.href,
                            text: JSON.stringify(fieldDescriptions, null, 2)
                        }]
                    };
                } catch (error) {
                    logger.error(`Error al obtener descripciones de campos para ${tableName}: ${error}`);
                    return {
                        contents: [{
                            uri: uri.href,
                            text: JSON.stringify({ error: `Error al obtener descripciones de campos para ${tableName}`, message: String(error) }, null, 2)
                        }]
                    };
                }
            }
        );
        
        // Recurso dinámico para obtener el esquema de una tabla específica
        server.resource(
            "table-schema",
            new serverModule.ResourceTemplate("firebird://table/{tableName}/schema", { list: undefined }),
            async (uri, { tableName }) => {
                logger.info(`Accediendo al esquema de la tabla: ${tableName}`);
                try {
                    // Validar el nombre de la tabla para prevenir inyección SQL
                    if (typeof tableName !== 'string' || !validateSql(tableName)) {
                        throw new Error(`Nombre de tabla inválido: ${tableName}`);
                    }
                    
                    const schema = await getTableSchema(String(tableName));
                    return {
                        contents: [{
                            uri: uri.href,
                            text: JSON.stringify(schema, null, 2)
                        }]
                    };
                } catch (error) {
                    logger.error(`Error al obtener esquema de tabla ${tableName}: ${error}`);
                    return {
                        contents: [{
                            uri: uri.href,
                            text: JSON.stringify({ error: `Error al obtener esquema de ${tableName}`, message: String(error) }, null, 2)
                        }]
                    };
                }
            }
        );
        
        // Recurso para obtener los primeros registros de una tabla
        server.resource(
            "table-data",
            new serverModule.ResourceTemplate("firebird://table/{tableName}/data", { list: undefined }),
            async (uri, { tableName }) => {
                logger.info(`Accediendo a los datos de la tabla: ${tableName}`);
                try {
                    // Validar el nombre de la tabla para prevenir inyección SQL
                    if (typeof tableName !== 'string' || !validateSql(tableName)) {
                        throw new Error(`Nombre de tabla inválido: ${tableName}`);
                    }
                    
                    const sql = `SELECT FIRST 20 * FROM "${tableName}"`;
                    const data = await executeQuery(sql);
                    
                    return {
                        contents: [{
                            uri: uri.href,
                            text: JSON.stringify(data, null, 2)
                        }]
                    };
                } catch (error) {
                    logger.error(`Error al obtener datos de tabla ${tableName}: ${error}`);
                    return {
                        contents: [{
                            uri: uri.href,
                            text: JSON.stringify({ error: `Error al obtener datos de ${tableName}`, message: String(error) }, null, 2)
                        }]
                    };
                }
            }
        );
        
        // 2. Definir herramientas para interactuar con la base de datos
        
        // Herramienta para ejecutar consultas SQL
        server.tool(
            "execute-query",
            { 
                sql: z.string().min(1).describe("Consulta SQL a ejecutar"),
                params: z.array(z.any()).optional().describe("Parámetros opcionales para la consulta")
            },
            async ({ sql, params = [] }) => {
                logger.info(`Ejecutando consulta SQL: ${sql}`);
                
                try {
                    // Validar SQL para seguridad básica
                    if (!validateSql(sql)) {
                        throw new Error(`Consulta SQL potencialmente peligrosa rechazada`);
                    }
                    
                    const results = await executeQuery(sql, params);
                    
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({ success: true, results }, null, 2)
                        }]
                    };
                } catch (error) {
                    logger.error(`Error al ejecutar consulta: ${error}`);
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({ 
                                success: false, 
                                error: String(error),
                                sql
                            }, null, 2)
                        }]
                    };
                }
            }
        );
        
        // Herramienta para listar tablas
        server.tool(
            "list-tables",
            {},
            async () => {
                logger.info("Listando tablas mediante herramienta");
                
                try {
                    const tables = await getTables();
                    
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({ success: true, tables }, null, 2)
                        }]
                    };
                } catch (error) {
                    logger.error(`Error al listar tablas: ${error}`);
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({ 
                                success: false, 
                                error: String(error)
                            }, null, 2)
                        }]
                    };
                }
            }
        );
        
        // Herramienta para describir tabla
        server.tool(
            "describe-table",
            {
                tableName: z.string().min(1).describe("Nombre de la tabla a describir")
            },
            async ({ tableName }) => {
                logger.info(`Describiendo tabla ${tableName}`);
                
                try {
                    // Validar el nombre de la tabla para prevenir inyección SQL
                    if (typeof tableName !== 'string' || !validateSql(tableName)) {
                        throw new Error(`Nombre de tabla inválido: ${tableName}`);
                    }
                    
                    const schema = await getTableSchema(String(tableName)); // Asegurando que tableName sea tratado como string
                    
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({ success: true, schema }, null, 2)
                        }]
                    };
                } catch (error) {
                    logger.error(`Error al describir tabla ${tableName}: ${error}`);
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({ 
                                success: false, 
                                error: String(error)
                            }, null, 2)
                        }]
                    };
                }
            }
        );
        
        // Herramienta para obtener descripciones de campos
        server.tool(
            "get-field-descriptions",
            {
                tableName: z.string().min(1).describe("Nombre de la tabla para obtener descripciones de campos")
            },
            async ({ tableName }) => {
                logger.info(`Obteniendo descripciones de campos para la tabla ${tableName}`);
                
                try {
                    // Validar el nombre de la tabla para prevenir inyección SQL
                    if (typeof tableName !== 'string' || !validateSql(tableName)) {
                        throw new Error(`Nombre de tabla inválido: ${tableName}`);
                    }
                    
                    const fieldDescriptions = await getFieldDescriptions(tableName);
                    
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({ success: true, fieldDescriptions }, null, 2)
                        }]
                    };
                } catch (error) {
                    logger.error(`Error al obtener descripciones de campos para ${tableName}: ${error}`);
                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify({ 
                                success: false, 
                                error: String(error)
                            }, null, 2)
                        }]
                    };
                }
            }
        );
        
        // 3. Definir prompts para facilitar la interacción con Firebird
        
        // Prompt para consultar datos
        server.prompt(
            "query-data",
            "Ejecuta y analiza una consulta SQL en Firebird",
            {
                sql: z.string().min(1).describe("Consulta SQL a ejecutar")
            },
            ({ sql }) => ({
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: `Por favor ejecuta y analiza la siguiente consulta SQL en la base de datos Firebird:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nExplica los resultados de manera clara y concisa.`
                    }
                }]
            })
        );
        
        // Prompt para analizar tabla
        server.prompt(
            "analyze-table",
            "Analiza la estructura y datos de una tabla en Firebird",
            {
                tableName: z.string().min(1).describe("Nombre de la tabla a analizar")
            },
            ({ tableName }) => ({
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: `Por favor analiza la estructura y los datos de la tabla \`${tableName}\` en la base de datos Firebird. Describe el esquema, los tipos de datos, las restricciones y muestra un resumen de los datos contenidos.`
                    }
                }]
            })
        );
        
        // Prompt para optimizar consulta
        server.prompt(
            "optimize-query",
            "Optimiza una consulta SQL para Firebird",
            {
                sql: z.string().min(1).describe("Consulta SQL a optimizar")
            },
            ({ sql }) => ({
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: `Por favor analiza y optimiza la siguiente consulta SQL para Firebird:\n\n\`\`\`sql\n${sql}\n\`\`\`\n\nExplica las mejoras realizadas y por qué podrían mejorar el rendimiento.`
                    }
                }]
            })
        );
        
        // Prompt para generar SQL
        server.prompt(
            "generate-sql",
            "Genera una consulta SQL para Firebird basada en una descripción",
            {
                description: z.string().min(1).describe("Descripción de la consulta que se desea generar")
            },
            ({ description }) => ({
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: `Por favor genera una consulta SQL para Firebird basada en la siguiente descripción:\n\n${description}\n\nExplica la consulta generada y cómo funciona.`
                    }
                }]
            })
        );
        
        // Conectar el servidor al transporte
        process.stderr.write("[INIT] Conectando servidor al transporte...\n");
        await server.connect(transport);
        process.stderr.write("[INIT] Servidor conectado y listo para recibir peticiones\n");
        
        // Notificar que el servidor está listo
        logger.info('Servidor MCP Firebird inicializado correctamente');
        
    } catch (error) {
        logger.error('Error al iniciar servidor: ' + error);
        process.exit(1);
    }
}).catch(error => {
    logger.error('Error al cargar módulos: ' + error);
    process.exit(1);
});