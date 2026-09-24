import { securityConfig } from './config.js';
import { checkAllowedOperation, checkAllowedTable } from './authorization.js';
import { FirebirdError } from '../utils/errors.js';

interface Token { value: string; kind: 'word' | 'quoted' | 'literal' | 'symbol'; start: number; end: number; depth: number }
const deny = (message: string): never => { throw new FirebirdError(message, 'SECURITY_ERROR'); };

/** Deliberately conservative SQL lexer. Unknown syntax is rejected, never guessed. */
export function tokenizeSql(sql: string): Token[] {
    if (Buffer.byteLength(sql, 'utf8') > 65536) deny('SQL exceeds the 64 KiB limit');
    const tokens: Token[] = [];
    let i = 0, depth = 0;
    while (i < sql.length) {
        if (/\s/.test(sql[i])) { i++; continue; }
        if (sql.startsWith('--', i)) { i = sql.indexOf('\n', i); if (i < 0) break; continue; }
        if (sql.startsWith('/*', i)) {
            const end = sql.indexOf('*/', i + 2);
            if (end < 0 || sql.slice(i + 2, end).includes('/*')) deny('Invalid SQL comment');
            i = end + 2; continue;
        }
        const start = i;
        if (sql[i] === "'" || sql[i] === '"') {
            const quote = sql[i++]; let value = ''; let closed = false;
            while (i < sql.length) {
                if (sql[i] === quote) {
                    if (sql[i + 1] === quote) { value += quote; i += 2; continue; }
                    i++; closed = true; break;
                }
                value += sql[i++];
            }
            if (!closed) deny('Unterminated SQL string or identifier');
            tokens.push({ value: quote === '"' ? value.trimEnd() : value, kind: quote === "'" ? 'literal' : 'quoted', start, end: i, depth }); continue;
        }
        const word = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/);
        if (word) { i += word[0].length; tokens.push({ value: word[0].toUpperCase(), kind: 'word', start, end: i, depth }); continue; }
        if (!/[0-9?.,()+*/%<>=!|:;\-]/.test(sql[i])) deny('Unsupported SQL syntax');
        const value = sql[i++];
        if (value === ')') depth--;
        if (depth < 0) deny('Unbalanced SQL parentheses');
        tokens.push({ value, kind: 'symbol', start, end: i, depth });
        if (value === '(') depth++;
    }
    if (depth !== 0 || !tokens.length) deny('Invalid SQL statement');
    const semicolons = tokens.filter(t => t.value === ';' && t.kind === 'symbol');
    if (semicolons.length && (semicolons.length !== 1 || tokens.at(-1) !== semicolons[0])) deny('Multiple SQL statements are not allowed');
    if (semicolons.length) tokens.pop();
    return tokens;
}

const READ_FUNCTIONS = new Set(('COUNT SUM AVG MIN MAX CAST COALESCE NULLIF IIF DECODE EXTRACT SUBSTRING TRIM UPPER LOWER CHAR_LENGTH CHARACTER_LENGTH OCTET_LENGTH POSITION REPLACE LEFT RIGHT LPAD RPAD ABS CEIL CEILING FLOOR ROUND TRUNC MOD POWER SQRT EXP LN LOG LOG10 SIGN DATEADD DATEDIFF LIST ASCII_CHAR ASCII_VAL REVERSE OVER PARTITION IN EXISTS NOT FIRST SKIP ROWS VALUES VARCHAR CHAR NUMERIC DECIMAL WHERE AND OR ON SELECT AS DISTINCT ALL BETWEEN CASE WHEN THEN ELSE HAVING FILTER ANY SOME').split(' '));
const DDL = new Set(['CREATE', 'ALTER', 'DROP', 'RECREATE', 'GRANT', 'REVOKE', 'COMMENT']);
export interface PreparedQuery { sql: string; operation: string; aliases: Record<string, string> }

export function prepareUserQuery(sql: string): PreparedQuery {
    const tokens = tokenizeSql(sql);
    const words = tokens.filter(t => t.kind === 'word').map(t => t.value);
    const first = tokens[0];
    if (!first || first.kind !== 'word') deny('Unsupported SQL statement');
    const operation = first.value === 'WITH' ? 'SELECT' : first.value;
    if (!['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE', ...DDL].includes(operation)) deny('Unsupported SQL operation');
    const policy = securityConfig.sql;
    checkAllowedOperation(operation);
    if (!['SELECT', 'EXECUTE'].includes(operation) && process.env.ALLOW_RAW_SQL !== 'true') deny('Direct writes require ALLOW_RAW_SQL=true');
    if (DDL.has(operation) && !policy?.allowDDL) deny('DDL requires sql.allowDDL=true');
    const restricted = !!(securityConfig.allowedTables || securityConfig.forbiddenTables?.length || securityConfig.tableNamePattern ||
        Object.keys(securityConfig.rowFilters || {}).length || securityConfig.dataMasking?.length ||
        (securityConfig.authorization && securityConfig.authorization.type !== 'none'));
    if (words.includes('BLOCK') || words.includes('STATEMENT')) deny('Dynamic SQL and procedural blocks are not supported');
    if (operation === 'SELECT' && words.some(w => ['INSERT', 'UPDATE', 'DELETE', 'MERGE', 'INTO', ...DDL].includes(w))) deny('Read queries cannot contain write operations');
    if (words.includes('UNION') && !policy?.allowUnsafeQueries) deny('UNION requires sql.allowUnsafeQueries=true');
    if (operation === 'SELECT' && words.includes('NEXT') && words.includes('VALUE')) {
        if (restricted || !policy?.allowUnsafeQueries || process.env.ALLOW_RAW_SQL !== 'true') deny('Sequence mutation requires an unrestricted trusted-query policy');
        checkAllowedOperation('EXECUTE');
    }
    if (operation === 'EXECUTE' && (tokens[1]?.value !== 'PROCEDURE' || !policy?.allowUnsafeQueries || process.env.ALLOW_RAW_SQL !== 'true' || restricted)) {
        deny('Procedure execution requires allowUnsafeQueries and cannot be combined with table, row, masking, or role restrictions');
    }
    // Opaque routines can read/write tables that are invisible to a SQL text policy.
    if (!DDL.has(operation) && operation !== 'EXECUTE') for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        // INSERT's column list is not a function call.
        if (tokens[i - 1]?.value === 'INTO') continue;
        if (['word', 'quoted'].includes(t.kind) && tokens[i + 1].value === '(' && (t.kind === 'quoted' || !READ_FUNCTIONS.has(t.value))) {
            if (restricted || !policy?.allowUnsafeQueries || process.env.ALLOW_RAW_SQL !== 'true') deny('Unrecognized SQL function requires an unrestricted trusted-query policy');
            checkAllowedOperation('EXECUTE');
        }
    }
    const relations: Token[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.kind !== 'word' || !['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE'].includes(t.value)) continue;
        if (t.value === 'UPDATE' && operation !== 'UPDATE') continue;
        const next = tokens[i + 1];
        if (!next || !['word', 'quoted'].includes(next.kind)) {
            if (t.value === 'FROM' && next?.value === '(' && !restricted) continue;
            deny('Unsupported relation expression');
        }
        if (tokens[i + 2]?.value === '.') deny('Qualified relation names are not supported');
        if (tokens[i + 2]?.value === '(' && t.value !== 'INTO' && t.value !== 'TABLE') deny('Selectable procedures require a dedicated trusted database view');
        relations.push(next);
        // Reject comma joins; otherwise a second relation could escape authorization.
        if (t.value === 'FROM' || t.value === 'JOIN') {
            for (let j = i + 2; j < tokens.length && tokens[j].depth >= t.depth; j++) {
                if (tokens[j].depth !== t.depth) continue;
                if (['WHERE', 'GROUP', 'ORDER', 'HAVING', 'ROWS', 'UNION', 'PLAN'].includes(tokens[j].value)) break;
                if (tokens[j].value === ',') deny('Comma joins are not supported; use explicit JOIN syntax');
            }
        }
    }
    for (const relation of relations) {
        const name = relation.value;
        if (/^(RDB|MON|SEC)\$/i.test(name)) {
            if (operation !== 'SELECT') deny('System relations are read-only through MCP');
            if (!policy?.allowSystemTables && !policy?.allowedSystemTables.includes(name)) deny(`System table ${name} is not allowed`);
        }
        // CTE names are only exempt when no table/role restrictions exist.
        if (first.value !== 'WITH' || restricted) checkAllowedTable(name);
    }
    const aliases: Record<string, string> = {};
    if (restricted) {
        if (first.value === 'WITH' || words.filter(w => w === 'SELECT').length > 1 || words.includes('JOIN') || words.includes('UNION') || relations.length !== 1 || DDL.has(operation) || operation === 'EXECUTE') {
            deny('This security policy supports single-table statements only; complex SQL must use a database-enforced view');
        }
        if (securityConfig.dataMasking?.length) {
            if (operation !== 'SELECT') deny('Writes are disabled when data masking is configured');
            const from = tokens.findIndex(t => t.kind === 'word' && t.value === 'FROM');
            let projection = sql.slice(first.end, tokens[from].start).trim().replace(/^(?:FIRST\s+\d+\s*)?(?:SKIP\s+\d+\s*)?/i, '').trim();
            const ident = '(?:[A-Za-z_][A-Za-z0-9_$]*|"(?:[^"]|"")+")';
            const direct = new RegExp(`^(${ident})(?:\\s+(?:AS\\s+)?(${ident}))?$`, 'i');
            if (projection !== '*') for (const column of projection.split(',')) {
                const match = column.trim().match(direct);
                if (!match) return deny('Masking requires SELECT * or direct columns (optional aliases); expressions are not allowed');
                const normalize = (s: string) => s.startsWith('"') ? s.slice(1, -1).replace(/""/g, '"').trimEnd() : s.toUpperCase();
                const alias = normalize(match[2] || match[1]);
                if (Object.keys(aliases).some(key => key.toUpperCase() === alias.toUpperCase())) deny('Duplicate output columns are not allowed with masking');
                aliases[alias] = normalize(match[1]);
            }
        }
        const table = relations[0];
        const filter = securityConfig.rowFilters?.[table.value];
        if (filter) {
            if (operation !== 'SELECT') deny('Row-filtered tables are read-only; use database-enforced write policies');
            const filterTokens = tokenizeSql(filter);
            if (filterTokens.some(t => t.kind === 'symbol' && ['?', ';'].includes(t.value)) || filterTokens.some(t => t.kind === 'word' && ['SELECT', 'EXECUTE', 'INSERT', 'UPDATE', 'DELETE'].includes(t.value))) deny('Invalid configured row filter');
            const after = tokens[tokens.indexOf(table) + 1];
            const hasAlias = after && ['word', 'quoted'].includes(after.kind) && !['WHERE','ORDER','GROUP','HAVING','ROWS','PLAN'].includes(after.value);
            const tableText = sql.slice(table.start, table.end);
            sql = sql.slice(0, table.start) + `(SELECT * FROM ${tableText} WHERE (${filter}))` + (hasAlias ? '' : ` ${tableText}`) + sql.slice(table.end);
        }
    }
    return { sql, operation, aliases };
}
