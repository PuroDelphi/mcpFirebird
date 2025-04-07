/**
 * Wrapped database queries module
 * 
 * Este módulo proporciona versiones wrapped de las funciones de consulta
 * que garantizan que siempre se use la configuración correcta.
 */

import { withCorrectConfig } from './wrapper.js';
import {
    executeQuery,
    listTables,
    describeTable,
    getFieldDescriptions,
    analyzeQueryPerformance,
    getExecutionPlan,
    analyzeMissingIndexes
} from './queries.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('db:wrapped-queries');

// Crear versiones wrapped de las funciones que garantizan el uso de la configuración correcta
const wrappedExecuteQuery = withCorrectConfig(executeQuery, 2); // config es el tercer parámetro (índice 2)
const wrappedListTables = withCorrectConfig(listTables);
const wrappedDescribeTable = withCorrectConfig(describeTable, 1); // config es el segundo parámetro (índice 1)
const wrappedGetFieldDescriptions = withCorrectConfig(getFieldDescriptions, 1);
const wrappedAnalyzeQueryPerformance = withCorrectConfig(analyzeQueryPerformance, 3);
const wrappedGetExecutionPlan = withCorrectConfig(getExecutionPlan, 2);
const wrappedAnalyzeMissingIndexes = withCorrectConfig(analyzeMissingIndexes, 1);

// Exportar las versiones wrapped de las funciones
export {
    wrappedExecuteQuery as executeQuery,
    wrappedListTables as listTables,
    wrappedDescribeTable as describeTable,
    wrappedGetFieldDescriptions as getFieldDescriptions,
    wrappedAnalyzeQueryPerformance as analyzeQueryPerformance,
    wrappedGetExecutionPlan as getExecutionPlan,
    wrappedAnalyzeMissingIndexes as analyzeMissingIndexes
};
