// src/resources/database.ts
import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { listTables, describeTable, executeQuery } from '../db/queries.js';
import { getTableSchema } from '../db/schema.js';

const logger = createLogger('database'); // Provide string argument

/**
 * Interfaz para definir un Recurso MCP.
 */
export interface ResourceDefinition {
    description: string; // Descripción del recurso
    handler: (params: Record<string, string>) => Promise<object>; // Handler recibe parámetros de la URI
}

/**
 * Configura los recursos relacionados con la base de datos y devuelve un mapa de definiciones.
 * @returns {Map<string, ResourceDefinition>} Mapa con las definiciones de recursos (clave puede ser nombre o URI template).
 */
export const setupDatabaseResources = (): Map<string, ResourceDefinition> => {
    const resources = new Map<string, ResourceDefinition>();

    // --- Definición del Recurso: Lista de Tablas --- (URI: /tables)
    const listTablesResource: ResourceDefinition = {
        description: "Recurso que representa la lista de todas las tablas en la base de datos.",
        handler: async () => {
            logger.info("Accediendo al recurso /tables");
            try {
                const tables = await listTables();
                return { tables };
            } catch (error: any) {
                logger.error(`Error al obtener la lista de tablas para el recurso /tables: ${error.message || error}`);
                return { contents: [], error: "Error interno al listar tablas", details: error.message || String(error) };
            }
        }
    };
    resources.set("/tables", listTablesResource); // Usar URI como clave

    // --- Definición del Recurso: Esquema de Tabla --- (URI: /tables/{tableName}/schema)
    const tableSchemaResource: ResourceDefinition = {
        description: "Recurso que representa el esquema de una tabla específica.",
        handler: async (params) => {
            const tableName = params.tableName;
            if (!tableName) {
                logger.warn("Intento de acceso a /tables/{tableName}/schema sin tableName");
                return { contents: [], error: "Falta el nombre de la tabla en la URI" };
            }
            logger.info(`Accediendo al recurso /tables/${tableName}/schema`);
            try {
                const schema = await getTableSchema(tableName);
                return schema;
            } catch (error: any) {
                logger.error(`Error al obtener el esquema para el recurso /tables/${tableName}/schema: ${error.message || error}`);
                return { contents: [], error: `Error interno al obtener esquema para ${tableName}`, details: error.message || String(error) };
            }
        }
    };
    // La clave podría ser la plantilla URI para que el handler en index.ts pueda hacer matching
    resources.set("/tables/{tableName}/schema", tableSchemaResource);

    // --- Definición del Recurso: Descripción de Tabla (describeTable) --- (URI: /tables/{tableName}/description)
    const tableDescriptionResource: ResourceDefinition = {
        description: "Recurso que representa la descripción detallada (columnas, tipos, etc.) de una tabla específica.",
        handler: async (params) => {
            const tableName = params.tableName;
            if (!tableName) {
                logger.warn("Intento de acceso a /tables/{tableName}/description sin tableName");
                return { contents: [], error: "Falta el nombre de la tabla en la URI" };
            }
            logger.info(`Accediendo al recurso /tables/${tableName}/description`);
            try {
                // Asumiendo que describeTable devuelve un objeto adecuado
                const description = await describeTable(tableName);
                return description;
            } catch (error: any) {
                logger.error(`Error al obtener la descripción para el recurso /tables/${tableName}/description: ${error.message || error}`);
                return { contents: [], error: `Error interno al obtener descripción para ${tableName}`, details: error.message || String(error) };
            }
        }
    };
    resources.set("/tables/{tableName}/description", tableDescriptionResource);


    // --- Definición del Recurso: Datos de Tabla (con paginación simple) --- (URI: /tables/{tableName}/data?first=N&skip=M)
    // Nota: Esto es un ejemplo simple, la paginación real puede ser más compleja.
    const tableDataResource: ResourceDefinition = {
        description: "Recurso que representa los datos de una tabla, con paginación básica (FIRST/SKIP).",
        handler: async (params) => {
            const tableName = params.tableName;
            const first = params.first ? parseInt(params.first, 10) : undefined;
            const skip = params.skip ? parseInt(params.skip, 10) : 0; // Default skip to 0

            if (!tableName) {
                logger.warn("Intento de acceso a /tables/{tableName}/data sin tableName");
                return { contents: [], error: "Falta el nombre de la tabla en la URI" };
            }
            if (params.first && (isNaN(first as number) || (first as number) <= 0)) {
                return { contents: [], error: "Parámetro 'first' debe ser un número positivo" };
            }
            if (params.skip && (isNaN(skip as number) || (skip as number) < 0)) {
                return { contents: [], error: "Parámetro 'skip' debe ser un número no negativo" };
            }

            logger.info(`Accediendo al recurso /tables/${tableName}/data (first: ${first}, skip: ${skip})`);
            try {
                // Construir la consulta base
                let sql = `SELECT * FROM "${tableName}"`; // Asegurar comillas por si acaso

                // Firebird usa FIRST y SKIP
                if (first !== undefined) {
                    sql += ` FIRST ${first}`;
                }
                if (skip > 0) {
                    sql += ` SKIP ${skip}`;
                }

                const results = await executeQuery(sql);
                return { data: results };
            } catch (error: any) {
                logger.error(`Error al obtener datos para el recurso /tables/${tableName}/data: ${error.message || error}`);
                return { contents: [], error: `Error interno al obtener datos para ${tableName}`, details: error.message || String(error) };
            }
        }
    };
    // URI puede incluir placeholders para query params, pero el matching debe hacerse en el handler de index.ts
    resources.set("/tables/{tableName}/data", tableDataResource); // Clave base sin query params

    // Añadir más recursos aquí...

    logger.info(`Definidos ${resources.size} recursos de base de datos.`);
    return resources;
};
