// Herramientas para consultas de base de datos
import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { validateSql } from '../utils/security.js';
import { stringifyCompact } from '../utils/jsonHelper.js';
import { 
    executeQuery, 
    getTables, 
    getFieldDescriptions, 
    describeTable,
    listTables,
    TableInfo,
    FieldInfo,
    ColumnInfo 
} from '../db/queries.js';
import { getTableSchema } from '../db/schema.js';
import { FirebirdError } from '../db/connection.js';

const logger = createLogger('tools:database');

/**
 * Tipos de respuesta para las herramientas MCP
 */
export interface MCPSuccessResponse<T> {
    success: true;
    result?: T;
    tables?: TableInfo[];
    schema?: ColumnInfo[];
    fieldDescriptions?: FieldInfo[];
}

export interface MCPErrorResponse {
    success: false;
    error: string;
    errorType?: string;
}

export type MCPResponse<T = any> = MCPSuccessResponse<T> | MCPErrorResponse;

/**
 * Interfaz para el servidor MCP
 */
export interface MCPServer {
    tool: (
        name: string, 
        schema: Record<string, any>, 
        handler: (params: any) => Promise<{ content: { type: string, text: string }[] }>
    ) => void;
    prompt: (name: string, description: string, prompts: Record<string, any>) => void;
}

/**
 * Envuelve un resultado en una respuesta de éxito para MCP
 * @param {T} data - Los datos a envolver en la respuesta
 * @param {string} dataKey - La clave bajo la cual se devolverán los datos (result, tables, schema, etc.)
 * @returns {MCPResponse<T>} Respuesta formateada para MCP
 */
function wrapSuccess<T>(data: T, dataKey: keyof MCPSuccessResponse<T> = 'result'): MCPResponse<T> {
    const response: any = { success: true };
    response[dataKey] = data;
    return response as MCPResponse<T>;
}

/**
 * Crea una respuesta de error para MCP
 * @param {Error} error - El error ocurrido
 * @returns {MCPErrorResponse} Respuesta de error formateada para MCP
 */
function wrapError(error: Error | FirebirdError | unknown): MCPErrorResponse {
    let errorMessage = 'Error desconocido';
    let errorType = 'UNKNOWN_ERROR';
    
    if (error instanceof FirebirdError) {
        errorMessage = error.message;
        errorType = error.type;
    } else if (error instanceof Error) {
        errorMessage = error.message;
    } else if (typeof error === 'string') {
        errorMessage = error;
    } else {
        errorMessage = String(error);
    }
    
    return {
        success: false,
        error: errorMessage,
        errorType
    };
}

/**
 * Configura las herramientas de base de datos para el servidor MCP
 * @param {MCPServer} server - Instancia del servidor MCP
 */
export const setupDatabaseTools = (server: MCPServer): void => {
    // Registrar las herramientas de base de datos

    /**
     * Herramienta para ejecutar consultas personalizadas
     * Permite a los usuarios ejecutar consultas SQL contra la base de datos Firebird
     */
    server.tool(
        "execute-query",
        {
            sql: z.string().min(1).describe("SQL query to execute (Firebird uses FIRST/ROWS for pagination instead of LIMIT)"),
            params: z.array(z.any()).optional().describe("Parameters for parameterized queries to prevent SQL injection")
        },
        async ({ sql, params = [] }: { sql: string, params?: any[] }) => {
            logger.info(`Ejecutando consulta: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`);

            try {
                // Validar la consulta SQL para prevenir inyección SQL
                if (typeof sql !== 'string' || !validateSql(sql)) {
                    throw new FirebirdError(
                        `Consulta SQL potencialmente insegura: ${sql.substring(0, 100)}${sql.length > 100 ? '...' : ''}`,
                        'SECURITY_ERROR'
                    );
                }

                const result = await executeQuery(sql, params);
                logger.info(`Consulta ejecutada correctamente, ${result.length} filas obtenidas`);

                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(wrapSuccess(result))
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error ejecutando consulta: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);
                
                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(errorResponse)
                    }]
                };
            }
        }
    );

    /**
     * Herramienta para listar tablas
     * Devuelve todas las tablas de usuario en la base de datos
     */
    server.tool(
        "list-tables",
        {},
        async () => {
            logger.info("Listando tablas en la base de datos");

            try {
                const tables = await getTables();
                logger.info(`Se encontraron ${tables.length} tablas`);

                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(wrapSuccess(tables, 'tables'))
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error listando tablas: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);
                
                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(errorResponse)
                    }]
                };
            }
        }
    );

    /**
     * Herramienta para describir una tabla
     * Devuelve información detallada sobre la estructura de una tabla específica
     */
    server.tool(
        "describe-table",
        {
            tableName: z.string().min(1).describe("Name of the table to get schema information for")
        },
        async ({ tableName }: { tableName: string }) => {
            logger.info(`Describiendo tabla ${tableName}`);

            try {
                // Validar el nombre de la tabla para prevenir inyección SQL
                if (typeof tableName !== 'string' || !validateSql(tableName)) {
                    throw new FirebirdError(
                        `Nombre de tabla inválido: ${tableName}`,
                        'VALIDATION_ERROR'
                    );
                }

                // Usar la nueva función describeTable en lugar de getTableSchema para obtener más información
                const schema = await describeTable(tableName);
                logger.info(`Se encontraron ${schema.length} columnas en la tabla ${tableName}`);

                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(wrapSuccess(schema, 'schema'))
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error al describir tabla ${tableName}: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);
                
                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(errorResponse)
                    }]
                };
            }
        }
    );

    /**
     * Herramienta para obtener descripciones de campos
     * Devuelve las descripciones documentadas para los campos de una tabla
     */
    server.tool(
        "get-field-descriptions",
        {
            tableName: z.string().min(1).describe("Name of the table to get field descriptions for")
        },
        async ({ tableName }: { tableName: string }) => {
            logger.info(`Obteniendo descripciones de campos para la tabla ${tableName}`);

            try {
                // Validar el nombre de la tabla para prevenir inyección SQL
                if (typeof tableName !== 'string' || !validateSql(tableName)) {
                    throw new FirebirdError(
                        `Nombre de tabla inválido: ${tableName}`,
                        'VALIDATION_ERROR'
                    );
                }

                const fieldDescriptions = await getFieldDescriptions(tableName);
                logger.info(`Se encontraron ${fieldDescriptions.length} descripciones de campos para la tabla ${tableName}`);

                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(wrapSuccess(fieldDescriptions, 'fieldDescriptions'))
                    }]
                };
            } catch (error) {
                const errorResponse = wrapError(error);
                logger.error(`Error al obtener descripciones de campos para ${tableName}: ${errorResponse.error} [${errorResponse.errorType || 'UNKNOWN'}]`);
                
                return {
                    content: [{
                        type: "json",
                        text: stringifyCompact(errorResponse)
                    }]
                };
            }
        }
    );

    /**
     * Registrar prompts para facilitar el uso de la base de datos
     */
    
    // Prompt para consultar datos
    server.prompt(
        "query-data",
        "Ayuda al usuario a consultar datos de la base de datos Firebird",
        {
            description: "Ayuda al usuario a consultar datos de la base de datos Firebird. Firebird usa FIRST/ROWS para paginación en lugar de LIMIT.",
            modelName: "gpt-4-turbo",
            temperature: 0,
            examples: [
                {
                    input: "Necesito consultar los primeros 10 clientes",
                    response: "Para consultar los primeros 10 clientes en Firebird, puedes usar la siguiente consulta:\n\n```sql\nSELECT FIRST 10 * FROM CLIENTES\nORDER BY ID_CLIENTE\n```\n\nFirebird usa FIRST en lugar de LIMIT para limitar el número de resultados. Si necesitas paginar resultados, puedes usar FIRST y SKIP:\n\n```sql\nSELECT FIRST 10 SKIP 20 * FROM CLIENTES\nORDER BY ID_CLIENTE\n```\n\nEsto traería los clientes 21-30."
                }
            ]
        }
    );

    // Prompt para analizar tablas
    server.prompt(
        "analyze-table",
        "Ayuda al usuario a analizar la estructura y datos de una tabla",
        {
            description: "Ayuda al usuario a entender la estructura de una tabla, sus campos, y a explorar sus datos.",
            modelName: "gpt-4-turbo",
            temperature: 0,
            examples: [
                {
                    input: "Quiero analizar la tabla CLIENTES, ¿cómo puedo ver su estructura y algunos ejemplos de datos?",
                    response: "Para analizar la tabla CLIENTES, primero puedes ver su estructura con:\n\n```sql\nDESCRIBE TABLE CLIENTES;\n-- o alternativamente\nSELECT * FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'CLIENTES';\n```\n\nPara ver algunos ejemplos de datos:\n\n```sql\nSELECT FIRST 10 * FROM CLIENTES;\n```\n\nSi quieres ver estadísticas básicas sobre la tabla:\n\n```sql\nSELECT COUNT(*) AS TOTAL_REGISTROS FROM CLIENTES;\n\n-- Para ver la distribución por algún campo, por ejemplo CIUDAD:\nSELECT CIUDAD, COUNT(*) AS CANTIDAD \nFROM CLIENTES \nGROUP BY CIUDAD \nORDER BY CANTIDAD DESC;\n```"
                }
            ]
        }
    );

    // Prompt para optimizar consultas
    server.prompt(
        "optimize-query",
        "Ayuda al usuario a optimizar sus consultas SQL para Firebird",
        {
            description: "Analiza consultas SQL y sugiere optimizaciones específicas para Firebird.",
            modelName: "gpt-4-turbo",
            temperature: 0,
            examples: [
                {
                    input: "¿Cómo puedo optimizar esta consulta? SELECT * FROM CLIENTES WHERE UPPER(NOMBRE) = 'JUAN'",
                    response: "Tu consulta actual:\n```sql\nSELECT * FROM CLIENTES WHERE UPPER(NOMBRE) = 'JUAN'\n```\n\nTiene algunos problemas de rendimiento:\n\n1. Estás usando UPPER() en la columna NOMBRE, lo que impide usar índices\n2. Estás seleccionando todas las columnas (*) cuando quizás no necesites todas\n\nRecomendaciones:\n\n1. Si necesitas búsqueda sin distinción entre mayúsculas/minúsculas, considera crear un índice computado:\n```sql\nCREATE INDEX IDX_CLIENTE_NOMBRE_UPPER ON CLIENTES COMPUTED BY (UPPER(NOMBRE));\n```\n\n2. Luego optimiza tu consulta:\n```sql\nSELECT ID_CLIENTE, NOMBRE, EMAIL -- solo columnas necesarias\nFROM CLIENTES \nWHERE UPPER(NOMBRE) = 'JUAN';\n```\n\n3. Alternativamente, si controlas la entrada de datos, guarda los nombres en mayúsculas o minúsculas consistentemente e indexa la columna normal."
                }
            ]
        }
    );

    // Prompt para generar SQL
    server.prompt(
        "generate-sql",
        "Ayuda al usuario a generar consultas SQL para Firebird",
        {
            description: "Genera consultas SQL para Firebird basadas en la descripción del usuario.",
            modelName: "gpt-4-turbo",
            temperature: 0,
            examples: [
                {
                    input: "Necesito una consulta que me muestre el total de ventas por cliente en el último mes, ordenado de mayor a menor",
                    response: "Aquí tienes una consulta SQL para Firebird que muestra el total de ventas por cliente en el último mes, ordenado de mayor a menor:\n\n```sql\nSELECT \n    C.ID_CLIENTE,\n    C.NOMBRE,\n    C.APELLIDO,\n    SUM(V.MONTO_TOTAL) AS TOTAL_VENTAS\nFROM \n    CLIENTES C\nJOIN \n    VENTAS V ON C.ID_CLIENTE = V.ID_CLIENTE\nWHERE \n    V.FECHA_VENTA >= DATEADD(MONTH, -1, CURRENT_DATE)\nGROUP BY \n    C.ID_CLIENTE, C.NOMBRE, C.APELLIDO\nORDER BY \n    TOTAL_VENTAS DESC;\n```\n\nNotas:\n- Se usa DATEADD(MONTH, -1, CURRENT_DATE) para obtener la fecha de hace un mes exacto\n- Se agrupa por ID_CLIENTE, NOMBRE y APELLIDO para tener una identificación completa\n- Se ordena por TOTAL_VENTAS en orden descendente (mayor a menor)\n\nDependiendo de tu estructura exacta de tablas, podrías necesitar ajustar los nombres de las tablas y campos."
                }
            ]
        }
    );
};
