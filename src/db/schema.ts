// Esquema de tablas
import { createLogger } from '../utils/logger.js';
import { validateSql } from '../utils/security.js';
import { DEFAULT_CONFIG, FirebirdError } from './connection.js';
import { executeQuery } from './queries.js';

const logger = createLogger('db:schema');

/**
 * Obtiene el esquema completo para una tabla específica
 * @param {string} tableName - Nombre de la tabla para la que obtener el esquema
 * @param {object} config - Configuración de conexión a la base de datos (opcional)
 * @returns {object} Esquema de tabla que incluye columnas, claves primarias y claves foráneas
 */
export const getTableSchema = async (tableName: string, config = DEFAULT_CONFIG) => {
    try {
        if (!validateSql(tableName)) {
            throw new FirebirdError(`Nombre de tabla inválido: ${tableName}`, 'VALIDATION_ERROR');
        }

        // Consulta para obtener columnas y tipos
        const columnsSql = `
            SELECT
                TRIM(rf.RDB$FIELD_NAME) AS field_name,
                CASE f.RDB$FIELD_TYPE
                    WHEN 7 THEN CASE f.RDB$FIELD_SUB_TYPE
                        WHEN 0 THEN 'SMALLINT'
                        WHEN 1 THEN 'NUMERIC(' || f.RDB$FIELD_PRECISION || ',' || (-f.RDB$FIELD_SCALE) || ')'
                        WHEN 2 THEN 'DECIMAL(' || f.RDB$FIELD_PRECISION || ',' || (-f.RDB$FIELD_SCALE) || ')'
                        ELSE 'SMALLINT'
                    END
                    WHEN 8 THEN CASE f.RDB$FIELD_SUB_TYPE
                        WHEN 0 THEN 'INTEGER'
                        WHEN 1 THEN 'NUMERIC(' || f.RDB$FIELD_PRECISION || ',' || (-f.RDB$FIELD_SCALE) || ')'
                        WHEN 2 THEN 'DECIMAL(' || f.RDB$FIELD_PRECISION || ',' || (-f.RDB$FIELD_SCALE) || ')'
                        ELSE 'INTEGER'
                    END
                    WHEN 9 THEN 'QUAD'
                    WHEN 10 THEN 'FLOAT'
                    WHEN 12 THEN 'DATE'
                    WHEN 13 THEN 'TIME'
                    WHEN 14 THEN 'CHAR(' || f.RDB$FIELD_LENGTH || ')'
                    WHEN 16 THEN CASE f.RDB$FIELD_SUB_TYPE
                        WHEN 0 THEN 'BIGINT'
                        WHEN 1 THEN 'NUMERIC(' || f.RDB$FIELD_PRECISION || ',' || (-f.RDB$FIELD_SCALE) || ')'
                        WHEN 2 THEN 'DECIMAL(' || f.RDB$FIELD_PRECISION || ',' || (-f.RDB$FIELD_SCALE) || ')'
                        ELSE 'BIGINT'
                    END
                    WHEN 27 THEN 'DOUBLE PRECISION'
                    WHEN 35 THEN 'TIMESTAMP'
                    WHEN 37 THEN 'VARCHAR(' || f.RDB$FIELD_LENGTH || ')'
                    WHEN 261 THEN CASE f.RDB$FIELD_SUB_TYPE
                        WHEN 0 THEN 'BLOB SUB_TYPE 0'
                        WHEN 1 THEN 'BLOB SUB_TYPE TEXT'
                        ELSE 'BLOB'
                    END
                    ELSE 'UNKNOWN'
                END AS field_type,
                CASE rf.RDB$NULL_FLAG
                    WHEN 1 THEN 0
                    ELSE 1
                END AS nullable,
                rf.RDB$DEFAULT_SOURCE AS default_value,
                rf.RDB$FIELD_POSITION AS position
            FROM RDB$RELATION_FIELDS rf
            JOIN RDB$FIELDS f ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
            WHERE rf.RDB$RELATION_NAME = ?
            ORDER BY rf.RDB$FIELD_POSITION
        `;

        // Consulta para obtener clave primaria
        const primaryKeySql = `
            SELECT TRIM(i.RDB$FIELD_NAME) as field_name
            FROM RDB$RELATION_CONSTRAINTS rc
            JOIN RDB$INDEX_SEGMENTS i ON rc.RDB$INDEX_NAME = i.RDB$INDEX_NAME
            WHERE rc.RDB$RELATION_NAME = ?
            AND rc.RDB$CONSTRAINT_TYPE = 'PRIMARY KEY'
            ORDER BY i.RDB$FIELD_POSITION
        `;

        // Consulta para obtener claves foráneas
        const foreignKeysSql = `
            SELECT
                TRIM(i.RDB$FIELD_NAME) as field_name,
                TRIM(rc.RDB$RELATION_NAME) as table_name,
                TRIM(rc2.RDB$RELATION_NAME) as referenced_table_name,
                TRIM(i2.RDB$FIELD_NAME) as referenced_field_name
            FROM RDB$RELATION_CONSTRAINTS rc
            JOIN RDB$REF_CONSTRAINTS refc ON rc.RDB$CONSTRAINT_NAME = refc.RDB$CONSTRAINT_NAME
            JOIN RDB$RELATION_CONSTRAINTS rc2 ON refc.RDB$CONST_NAME_UQ = rc2.RDB$CONSTRAINT_NAME
            JOIN RDB$INDEX_SEGMENTS i ON rc.RDB$INDEX_NAME = i.RDB$INDEX_NAME
            JOIN RDB$INDEX_SEGMENTS i2 ON rc2.RDB$INDEX_NAME = i2.RDB$INDEX_NAME
            WHERE rc.RDB$RELATION_NAME = ?
            AND rc.RDB$CONSTRAINT_TYPE = 'FOREIGN KEY'
            AND i.RDB$FIELD_POSITION = i2.RDB$FIELD_POSITION
            ORDER BY i.RDB$FIELD_POSITION
        `;

        // Consulta para obtener índices
        const indexesSql = `
            SELECT
                TRIM(i.RDB$INDEX_NAME) as index_name,
                TRIM(s.RDB$FIELD_NAME) as field_name,
                i.RDB$UNIQUE_FLAG as is_unique
            FROM RDB$INDICES i
            JOIN RDB$INDEX_SEGMENTS s ON i.RDB$INDEX_NAME = s.RDB$INDEX_NAME
            WHERE i.RDB$RELATION_NAME = ?
            AND NOT EXISTS (
                SELECT 1 FROM RDB$RELATION_CONSTRAINTS c
                WHERE c.RDB$INDEX_NAME = i.RDB$INDEX_NAME
                AND c.RDB$CONSTRAINT_TYPE IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
            )
            ORDER BY i.RDB$INDEX_NAME, s.RDB$FIELD_POSITION
        `;

        // Ejecutar consultas en paralelo
        const [columnsResult, primaryKeyResult, foreignKeysResult, indexesResult] = await Promise.all([
            executeQuery(columnsSql, [tableName], config),
            executeQuery(primaryKeySql, [tableName], config),
            executeQuery(foreignKeysSql, [tableName], config),
            executeQuery(indexesSql, [tableName], config),
        ]);

        // Procesar columnas
        const columns = columnsResult.map((col: any) => ({
            name: col.FIELD_NAME,
            type: col.FIELD_TYPE,
            nullable: col.NULLABLE === 1,
            defaultValue: col.DEFAULT_VALUE,
            position: col.POSITION
        }));

        // Procesar clave primaria
        const primaryKey = primaryKeyResult.map((pk: any) => pk.FIELD_NAME);

        // Procesar claves foráneas
        const foreignKeys: Array<{ column: string; references: { table: string; column: string } }> = [];
        foreignKeysResult.forEach((fk: any) => {
            foreignKeys.push({
                column: fk.FIELD_NAME,
                references: {
                    table: fk.REFERENCED_TABLE_NAME,
                    column: fk.REFERENCED_FIELD_NAME
                }
            });
        });

        // Procesar índices
        const indexesMap = new Map();
        indexesResult.forEach((idx: any) => {
            const indexName = idx.INDEX_NAME;
            if (!indexesMap.has(indexName)) {
                indexesMap.set(indexName, {
                    name: indexName,
                    unique: idx.IS_UNIQUE === 1,
                    columns: []
                });
            }
            indexesMap.get(indexName).columns.push(idx.FIELD_NAME);
        });
        const indexes = Array.from(indexesMap.values());

        // Retornar esquema completo
        return {
            name: tableName,
            columns,
            primaryKey: primaryKey.length > 0 ? primaryKey : undefined,
            foreignKeys: foreignKeys.length > 0 ? foreignKeys : undefined,
            indexes: indexes.length > 0 ? indexes : undefined
        };
    } catch (error) {
        logger.error(`Error obteniendo esquema de tabla ${tableName}: ${error}`);
        if (error instanceof FirebirdError) {
            throw error;
        } else {
            throw new FirebirdError(
                `Error inesperado obteniendo esquema para ${tableName}: ${(error as Error).message}`,
                'SCHEMA_ERROR',
                error
            );
        }
    }
};
