/**
 * Database metadata module for MCP Firebird
 * Provides functionality for retrieving metadata about database objects
 * (triggers, stored procedures, functions, packages)
 */

import { executeQuery } from './queries.js';
import { ConfigOptions } from './connection.js';
import { createLogger } from '../utils/logger.js';
import { FirebirdError } from '../utils/errors.js';
import { validateSql } from '../utils/security.js';

const logger = createLogger('db:metadata');

/**
 * Interface for trigger information
 */
export interface TriggerInfo {
    name: string;
    tableName: string;
    triggerType: string;
    sequence: number;
    inactive: boolean;
    source: string;
    description?: string;
}

/**
 * Interface for stored procedure information
 */
export interface ProcedureInfo {
    name: string;
    inputParams: number;
    outputParams: number;
    source: string;
    description?: string;
    validBlr: boolean;
}

/**
 * Interface for function information
 */
export interface FunctionInfo {
    name: string;
    moduleName?: string;
    entryPoint?: string;
    returnArgument: number;
    source?: string;
    description?: string;
    validBlr: boolean;
}

/**
 * Interface for package information
 */
export interface PackageInfo {
    name: string;
    headerSource: string;
    bodySource?: string;
    description?: string;
    validBodyFlag: boolean;
}

/**
 * Get list of all triggers in the database
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<TriggerInfo[]>} Array of trigger information
 */
export const listTriggers = async (config?: ConfigOptions): Promise<TriggerInfo[]> => {
    try {
        logger.info('Getting list of triggers');

        const sql = `
            SELECT
                TRIM(RDB$TRIGGER_NAME) AS NAME,
                TRIM(RDB$RELATION_NAME) AS TABLE_NAME,
                RDB$TRIGGER_TYPE AS TRIGGER_TYPE,
                RDB$TRIGGER_SEQUENCE AS SEQUENCE,
                RDB$TRIGGER_INACTIVE AS INACTIVE,
                RDB$DESCRIPTION AS DESCRIPTION
            FROM RDB$TRIGGERS
            WHERE RDB$SYSTEM_FLAG = 0
            ORDER BY RDB$RELATION_NAME, RDB$TRIGGER_SEQUENCE
        `;

        const triggers = await executeQuery(sql, [], config);
        logger.info(`Found ${triggers.length} triggers`);

        return triggers.map((t: any) => ({
            name: t.NAME,
            tableName: t.TABLE_NAME || 'DATABASE',
            triggerType: getTriggerTypeDescription(t.TRIGGER_TYPE),
            sequence: t.SEQUENCE,
            inactive: t.INACTIVE === 1,
            source: '', // Will be loaded separately
            description: t.DESCRIPTION || undefined
        }));
    } catch (error: any) {
        const errorMessage = `Error listing triggers: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'METADATA_ERROR', error);
    }
};

/**
 * Get detailed information about a specific trigger
 * @param {string} triggerName - Name of the trigger
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<TriggerInfo>} Trigger information including source code
 */
export const describeTrigger = async (triggerName: string, config?: ConfigOptions): Promise<TriggerInfo> => {
    try {
        if (!validateSql(triggerName)) {
            throw new FirebirdError(`Invalid trigger name: ${triggerName}`, 'VALIDATION_ERROR');
        }

        logger.info(`Getting details for trigger: ${triggerName}`);

        const sql = `
            SELECT
                TRIM(RDB$TRIGGER_NAME) AS NAME,
                TRIM(RDB$RELATION_NAME) AS TABLE_NAME,
                RDB$TRIGGER_TYPE AS TRIGGER_TYPE,
                RDB$TRIGGER_SEQUENCE AS SEQUENCE,
                RDB$TRIGGER_INACTIVE AS INACTIVE,
                RDB$TRIGGER_SOURCE AS SOURCE,
                RDB$DESCRIPTION AS DESCRIPTION
            FROM RDB$TRIGGERS
            WHERE RDB$TRIGGER_NAME = ?
        `;

        const result = await executeQuery(sql, [triggerName], config);

        if (result.length === 0) {
            throw new FirebirdError(`Trigger not found: ${triggerName}`, 'NOT_FOUND');
        }

        const trigger = result[0];
        logger.info(`Retrieved trigger details for: ${triggerName}`);

        return {
            name: trigger.NAME,
            tableName: trigger.TABLE_NAME || 'DATABASE',
            triggerType: getTriggerTypeDescription(trigger.TRIGGER_TYPE),
            sequence: trigger.SEQUENCE,
            inactive: trigger.INACTIVE === 1,
            source: trigger.SOURCE || '',
            description: trigger.DESCRIPTION || undefined
        };
    } catch (error: any) {
        if (error instanceof FirebirdError) {
            throw error;
        }
        const errorMessage = `Error describing trigger ${triggerName}: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'METADATA_ERROR', error);
    }
};

/**
 * Get list of all stored procedures in the database
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<ProcedureInfo[]>} Array of procedure information
 */
export const listProcedures = async (config?: ConfigOptions): Promise<ProcedureInfo[]> => {
    try {
        logger.info('Getting list of stored procedures');

        const sql = `
            SELECT
                TRIM(RDB$PROCEDURE_NAME) AS NAME,
                RDB$PROCEDURE_INPUTS AS INPUT_PARAMS,
                RDB$PROCEDURE_OUTPUTS AS OUTPUT_PARAMS,
                RDB$DESCRIPTION AS DESCRIPTION,
                RDB$VALID_BLR AS VALID_BLR
            FROM RDB$PROCEDURES
            WHERE RDB$SYSTEM_FLAG = 0
            ORDER BY RDB$PROCEDURE_NAME
        `;

        const procedures = await executeQuery(sql, [], config);
        logger.info(`Found ${procedures.length} stored procedures`);

        return procedures.map((p: any) => ({
            name: p.NAME,
            inputParams: p.INPUT_PARAMS || 0,
            outputParams: p.OUTPUT_PARAMS || 0,
            source: '', // Will be loaded separately
            description: p.DESCRIPTION || undefined,
            validBlr: p.VALID_BLR === 1
        }));
    } catch (error: any) {
        const errorMessage = `Error listing procedures: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'METADATA_ERROR', error);
    }
};

/**
 * Get detailed information about a specific stored procedure
 * @param {string} procedureName - Name of the procedure
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<ProcedureInfo>} Procedure information including source code
 */
export const describeProcedure = async (procedureName: string, config?: ConfigOptions): Promise<ProcedureInfo> => {
    try {
        if (!validateSql(procedureName)) {
            throw new FirebirdError(`Invalid procedure name: ${procedureName}`, 'VALIDATION_ERROR');
        }

        logger.info(`Getting details for procedure: ${procedureName}`);

        const sql = `
            SELECT
                TRIM(RDB$PROCEDURE_NAME) AS NAME,
                RDB$PROCEDURE_INPUTS AS INPUT_PARAMS,
                RDB$PROCEDURE_OUTPUTS AS OUTPUT_PARAMS,
                RDB$PROCEDURE_SOURCE AS SOURCE,
                RDB$DESCRIPTION AS DESCRIPTION,
                RDB$VALID_BLR AS VALID_BLR
            FROM RDB$PROCEDURES
            WHERE RDB$PROCEDURE_NAME = ?
        `;

        const result = await executeQuery(sql, [procedureName], config);

        if (result.length === 0) {
            throw new FirebirdError(`Procedure not found: ${procedureName}`, 'NOT_FOUND');
        }

        const proc = result[0];
        logger.info(`Retrieved procedure details for: ${procedureName}`);

        return {
            name: proc.NAME,
            inputParams: proc.INPUT_PARAMS || 0,
            outputParams: proc.OUTPUT_PARAMS || 0,
            source: proc.SOURCE || '',
            description: proc.DESCRIPTION || undefined,
            validBlr: proc.VALID_BLR === 1
        };
    } catch (error: any) {
        if (error instanceof FirebirdError) {
            throw error;
        }
        const errorMessage = `Error describing procedure ${procedureName}: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'METADATA_ERROR', error);
    }
};

/**
 * Get list of all functions in the database
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<FunctionInfo[]>} Array of function information
 */
export const listFunctions = async (config?: ConfigOptions): Promise<FunctionInfo[]> => {
    try {
        logger.info('Getting list of functions');

        const sql = `
            SELECT
                TRIM(RDB$FUNCTION_NAME) AS NAME,
                TRIM(RDB$MODULE_NAME) AS MODULE_NAME,
                TRIM(RDB$ENTRYPOINT) AS ENTRY_POINT,
                RDB$RETURN_ARGUMENT AS RETURN_ARGUMENT,
                RDB$DESCRIPTION AS DESCRIPTION,
                RDB$VALID_BLR AS VALID_BLR
            FROM RDB$FUNCTIONS
            WHERE RDB$SYSTEM_FLAG = 0
            ORDER BY RDB$FUNCTION_NAME
        `;

        const functions = await executeQuery(sql, [], config);
        logger.info(`Found ${functions.length} functions`);

        return functions.map((f: any) => ({
            name: f.NAME,
            moduleName: f.MODULE_NAME,
            entryPoint: f.ENTRY_POINT,
            returnArgument: f.RETURN_ARGUMENT || 0,
            description: f.DESCRIPTION || undefined,
            validBlr: f.VALID_BLR === 1
        }));
    } catch (error: any) {
        const errorMessage = `Error listing functions: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'METADATA_ERROR', error);
    }
};

/**
 * Get detailed information about a specific function
 * @param {string} functionName - Name of the function
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<FunctionInfo>} Function information including source code
 */
export const describeFunction = async (functionName: string, config?: ConfigOptions): Promise<FunctionInfo> => {
    try {
        if (!validateSql(functionName)) {
            throw new FirebirdError(`Invalid function name: ${functionName}`, 'VALIDATION_ERROR');
        }

        logger.info(`Getting details for function: ${functionName}`);

        const sql = `
            SELECT
                TRIM(RDB$FUNCTION_NAME) AS NAME,
                TRIM(RDB$MODULE_NAME) AS MODULE_NAME,
                TRIM(RDB$ENTRYPOINT) AS ENTRY_POINT,
                RDB$RETURN_ARGUMENT AS RETURN_ARGUMENT,
                RDB$FUNCTION_SOURCE AS SOURCE,
                RDB$DESCRIPTION AS DESCRIPTION,
                RDB$VALID_BLR AS VALID_BLR
            FROM RDB$FUNCTIONS
            WHERE RDB$FUNCTION_NAME = ?
        `;

        const result = await executeQuery(sql, [functionName], config);

        if (result.length === 0) {
            throw new FirebirdError(`Function not found: ${functionName}`, 'NOT_FOUND');
        }

        const func = result[0];
        logger.info(`Retrieved function details for: ${functionName}`);

        return {
            name: func.NAME,
            moduleName: func.MODULE_NAME,
            entryPoint: func.ENTRY_POINT,
            returnArgument: func.RETURN_ARGUMENT || 0,
            source: func.SOURCE || undefined,
            description: func.DESCRIPTION || undefined,
            validBlr: func.VALID_BLR === 1
        };
    } catch (error: any) {
        if (error instanceof FirebirdError) {
            throw error;
        }
        const errorMessage = `Error describing function ${functionName}: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'METADATA_ERROR', error);
    }
};

/**
 * Get list of all packages in the database
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<PackageInfo[]>} Array of package information
 */
export const listPackages = async (config?: ConfigOptions): Promise<PackageInfo[]> => {
    try {
        logger.info('Getting list of packages');

        const sql = `
            SELECT
                TRIM(RDB$PACKAGE_NAME) AS NAME,
                RDB$DESCRIPTION AS DESCRIPTION,
                RDB$VALID_BODY_FLAG AS VALID_BODY_FLAG
            FROM RDB$PACKAGES
            WHERE RDB$SYSTEM_FLAG = 0
            ORDER BY RDB$PACKAGE_NAME
        `;

        const packages = await executeQuery(sql, [], config);
        logger.info(`Found ${packages.length} packages`);

        return packages.map((p: any) => ({
            name: p.NAME,
            headerSource: '', // Will be loaded separately
            bodySource: undefined,
            description: p.DESCRIPTION || undefined,
            validBodyFlag: p.VALID_BODY_FLAG === 1
        }));
    } catch (error: any) {
        const errorMessage = `Error listing packages: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'METADATA_ERROR', error);
    }
};

/**
 * Get detailed information about a specific package
 * @param {string} packageName - Name of the package
 * @param {ConfigOptions} config - Database connection configuration
 * @returns {Promise<PackageInfo>} Package information including header and body source
 */
export const describePackage = async (packageName: string, config?: ConfigOptions): Promise<PackageInfo> => {
    try {
        if (!validateSql(packageName)) {
            throw new FirebirdError(`Invalid package name: ${packageName}`, 'VALIDATION_ERROR');
        }

        logger.info(`Getting details for package: ${packageName}`);

        const sql = `
            SELECT
                TRIM(RDB$PACKAGE_NAME) AS NAME,
                RDB$PACKAGE_HEADER_SOURCE AS HEADER_SOURCE,
                RDB$PACKAGE_BODY_SOURCE AS BODY_SOURCE,
                RDB$DESCRIPTION AS DESCRIPTION,
                RDB$VALID_BODY_FLAG AS VALID_BODY_FLAG
            FROM RDB$PACKAGES
            WHERE RDB$PACKAGE_NAME = ?
        `;

        const result = await executeQuery(sql, [packageName], config);

        if (result.length === 0) {
            throw new FirebirdError(`Package not found: ${packageName}`, 'NOT_FOUND');
        }

        const pkg = result[0];
        logger.info(`Retrieved package details for: ${packageName}`);

        return {
            name: pkg.NAME,
            headerSource: pkg.HEADER_SOURCE || '',
            bodySource: pkg.BODY_SOURCE || undefined,
            description: pkg.DESCRIPTION || undefined,
            validBodyFlag: pkg.VALID_BODY_FLAG === 1
        };
    } catch (error: any) {
        if (error instanceof FirebirdError) {
            throw error;
        }
        const errorMessage = `Error describing package ${packageName}: ${error.message || error}`;
        logger.error(errorMessage);
        throw new FirebirdError(errorMessage, 'METADATA_ERROR', error);
    }
};

/**
 * Helper function to get trigger type description
 * @param {number} triggerType - Firebird trigger type code
 * @returns {string} Human-readable trigger type description
 */
function getTriggerTypeDescription(triggerType: number): string {
    const types: { [key: number]: string } = {
        1: 'BEFORE INSERT',
        2: 'AFTER INSERT',
        3: 'BEFORE UPDATE',
        4: 'AFTER UPDATE',
        5: 'BEFORE DELETE',
        6: 'AFTER DELETE',
        17: 'BEFORE INSERT OR UPDATE',
        18: 'AFTER INSERT OR UPDATE',
        25: 'BEFORE INSERT OR DELETE',
        26: 'AFTER INSERT OR DELETE',
        27: 'BEFORE UPDATE OR DELETE',
        28: 'AFTER UPDATE OR DELETE',
        113: 'BEFORE INSERT OR UPDATE OR DELETE',
        114: 'AFTER INSERT OR UPDATE OR DELETE',
        8192: 'ON CONNECT',
        8193: 'ON DISCONNECT',
        8194: 'ON TRANSACTION START',
        8195: 'ON TRANSACTION COMMIT',
        8196: 'ON TRANSACTION ROLLBACK'
    };

    return types[triggerType] || `UNKNOWN (${triggerType})`;
}

/**
 * Lista los eventos disponibles en los triggers y procedimientos (aquellos que usan POST_EVENT)
 */
export async function listAvailableEvents(): Promise<{ name: string, type: string }[]> {
    logger.debug('Retrieving available POST_EVENTs');
    
    const query = `
        SELECT TRIM(RDB$TRIGGER_NAME) as NAME, 'TRIGGER' as TYPE 
        FROM RDB$TRIGGERS 
        WHERE RDB$TRIGGER_SOURCE LIKE '%POST_EVENT%' 
        UNION ALL 
        SELECT TRIM(RDB$PROCEDURE_NAME) as NAME, 'PROCEDURE' as TYPE 
        FROM RDB$PROCEDURES 
        WHERE RDB$PROCEDURE_SOURCE LIKE '%POST_EVENT%'
    `;
    
    try {
        const results = await executeQuery(query) as { NAME: string, TYPE: string }[];
        return results.map(row => ({
            name: row.NAME,
            type: row.TYPE
        }));
    } catch (error) {
        logger.error('Failed to retrieve events', { error });
        throw new FirebirdError('Failed to retrieve available events', 'FIREBIRD_ERROR', error);
    }
}
