import { createHash } from 'node:crypto';
import { tokenizeSql } from '../security/sqlPolicy.js';
import { checkAllowedOperation, checkAllowedTable } from '../security/authorization.js';
import { FirebirdError } from '../utils/errors.js';

type MetadataReader = (sql: string, params: any[]) => Promise<any[]>;
type Candidate = { columns: string[]; direction: number; filtering: boolean };
type Index = { name: string; columns: string[]; direction: number; inactive: boolean; partial: boolean; expression: boolean };
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const text = (value: any): string => String(value ?? '').trimEnd();

/** Conservative suggestions only: never execute the supplied SQL or generated DDL. */
export async function adviseIndexes(sql: string, read: MetadataReader) {
    const tokens = tokenizeSql(sql);
    const words = tokens.filter(t => t.kind === 'word');
    const unsupported = () => ({ missingIndexes: [] as string[], recommendations: ['No index DDL generated: this conservative advisor requires a single-table SELECT with direct column predicates/order terms. This is not evidence that no index is needed.'], success: true });
    if (tokens[0]?.value !== 'SELECT' || words.filter(t => t.value === 'SELECT').length !== 1 ||
        words.some(t => ['JOIN', 'UNION', 'GROUP', 'HAVING', 'WINDOW'].includes(t.value))) return unsupported();
    const from = tokens.findIndex(t => t.kind === 'word' && t.value === 'FROM' && t.depth === 0);
    const table = tokens[from + 1];
    if (from < 0 || !table || !['word', 'quoted'].includes(table.kind) || /^(RDB|MON|SEC)\$/i.test(table.value) ||
        tokens[from + 2]?.value === '.' || tokens[from + 2]?.value === '(') return unsupported();
    const stops = new Set(['WHERE', 'ORDER', 'ROWS', 'PLAN', 'FOR', 'OFFSET', 'FETCH']);
    let cursor = from + 2, alias = table.value;
    if (tokens[cursor]?.kind === 'word' && tokens[cursor].value === 'AS') cursor++;
    if (tokens[cursor] && ['word', 'quoted'].includes(tokens[cursor].kind) &&
        !(tokens[cursor].kind === 'word' && stops.has(tokens[cursor].value))) alias = tokens[cursor++].value;
    if (tokens.slice(cursor).some(t => t.depth === 0 && t.value === ',' &&
        t.start < (tokens.find(w => w.kind === 'word' && ['WHERE', 'ORDER'].includes(w.value))?.start ?? Infinity))) return unsupported();
    checkAllowedOperation('SELECT'); checkAllowedTable(table.value);

    const candidates: Candidate[] = [];
    const identifierAt = (at: number): { name: string; next: number } | undefined => {
        const token = tokens[at];
        if (!token || !['word', 'quoted'].includes(token.kind)) return;
        if (tokens[at + 1]?.value === '.') {
            const column = tokens[at + 2];
            if (![table.value, alias].includes(token.value) || !column || !['word', 'quoted'].includes(column.kind)) return;
            return { name: column.value, next: at + 3 };
        }
        if (tokens[at - 1]?.value === '.') return;
        return { name: token.value, next: at + 1 };
    };
    const where = tokens.findIndex(t => t.kind === 'word' && t.value === 'WHERE' && t.depth === 0);
    const order = tokens.findIndex((t, i) => t.kind === 'word' && t.value === 'ORDER' && t.depth === 0 && tokens[i + 1]?.value === 'BY');
    if (where >= 0) for (let i = where + 1; i < (order < 0 ? tokens.length : order); i++) {
        const column = identifierAt(i), op = column && tokens[column.next];
        if (column && op && ((op.kind === 'symbol' && ['=', '>', '<'].includes(op.value)) ||
            (op.kind === 'word' && ['IN', 'BETWEEN', 'IS'].includes(op.value)))) {
            candidates.push({ columns: [column.name], direction: 0, filtering: true });
            i = column.next;
        }
    }
    if (order >= 0) {
        const columns: string[] = [], directions: number[] = [];
        let i = order + 2, valid = true;
        while (i < tokens.length) {
            const column = identifierAt(i);
            if (!column) { valid = false; break; }
            columns.push(column.name); i = column.next;
            const direction = tokens[i]?.kind === 'word' && tokens[i].value === 'DESC' ? 1 : 0;
            if (tokens[i]?.kind === 'word' && ['ASC', 'DESC'].includes(tokens[i].value)) i++;
            directions.push(direction);
            if (tokens[i]?.value === ',') { i++; if (i === tokens.length) valid = false; continue; }
            if (i < tokens.length && !(tokens[i].kind === 'word' && ['ROWS', 'FOR', 'OFFSET', 'FETCH'].includes(tokens[i].value))) valid = false;
            break;
        }
        if (valid && columns.length && directions.every(d => d === directions[0])) candidates.push({ columns, direction: directions[0], filtering: false });
    }
    if (!candidates.length) return unsupported();
    const fields = await read(`SELECT RF.RDB$FIELD_NAME AS FIELD_NAME,
        CASE WHEN F.RDB$COMPUTED_BLR IS NULL AND F.RDB$DIMENSIONS IS NULL AND F.RDB$FIELD_TYPE <> 261 THEN 1 ELSE 0 END AS IS_INDEXABLE,
        CASE WHEN R.RDB$VIEW_BLR IS NULL THEN 0 ELSE 1 END AS IS_VIEW
        FROM RDB$RELATION_FIELDS RF JOIN RDB$FIELDS F ON RF.RDB$FIELD_SOURCE = F.RDB$FIELD_NAME
        JOIN RDB$RELATIONS R ON R.RDB$RELATION_NAME = RF.RDB$RELATION_NAME
        WHERE RF.RDB$RELATION_NAME = ?`, [table.value]);
    if (!fields.length || fields.some(row => Number(row.IS_VIEW) === 1)) return unsupported();
    const indexable = new Set(fields.filter(row => Number(row.IS_INDEXABLE) === 1).map(row => text(row.FIELD_NAME)));
    const partialColumn = await read(`SELECT RDB$FIELD_NAME AS FIELD_NAME FROM RDB$RELATION_FIELDS
        WHERE RDB$RELATION_NAME = ? AND RDB$FIELD_NAME = ?`, ['RDB$INDICES', 'RDB$CONDITION_BLR']);
    const partialFlag = partialColumn.length ? 'CASE WHEN I.RDB$CONDITION_BLR IS NULL THEN 0 ELSE 1 END' : '0';
    const rows = await read(`SELECT I.RDB$INDEX_NAME AS INDEX_NAME, I.RDB$INDEX_TYPE AS INDEX_TYPE,
        I.RDB$INDEX_INACTIVE AS IS_INACTIVE,
        CASE WHEN I.RDB$EXPRESSION_BLR IS NULL THEN 0 ELSE 1 END AS IS_EXPRESSION,
        ${partialFlag} AS IS_PARTIAL, S.RDB$FIELD_NAME AS FIELD_NAME, S.RDB$FIELD_POSITION AS FIELD_POSITION
        FROM RDB$INDICES I LEFT JOIN RDB$INDEX_SEGMENTS S ON I.RDB$INDEX_NAME = S.RDB$INDEX_NAME
        WHERE I.RDB$RELATION_NAME = ? ORDER BY I.RDB$INDEX_NAME, S.RDB$FIELD_POSITION`, [table.value]);
    const indexes = new Map<string, Index>();
    const fieldNames = new Set(fields.map(row => text(row.FIELD_NAME)));
    for (const row of rows) {
        const name = text(row.INDEX_NAME);
        if (!name) throw new FirebirdError('Index metadata is incomplete or transformed; no index DDL generated', 'METADATA_VALIDATION_ERROR');
        if (!indexes.has(name)) indexes.set(name, { name, columns: [], direction: Number(row.INDEX_TYPE) || 0,
            inactive: Number(row.IS_INACTIVE) === 1, partial: Number(row.IS_PARTIAL) === 1, expression: Number(row.IS_EXPRESSION) === 1 });
        if (row.FIELD_NAME != null) {
            const index = indexes.get(name)!;
            const column = text(row.FIELD_NAME);
            // Reject missing/truncated/transformed segment sequences rather than
            // interpreting incomplete coverage as a reason to create a duplicate.
            if (!fieldNames.has(column) || Number(row.FIELD_POSITION) !== index.columns.length) {
                throw new FirebirdError('Index metadata is incomplete or transformed; no index DDL generated', 'METADATA_VALIDATION_ERROR');
            }
            index.columns.push(column);
        }
    }
    const covers = (index: { columns: string[]; direction: number }, candidate: Candidate) =>
        candidate.columns.every((column, i) => index.columns[i] === column) && (candidate.filtering || index.direction === candidate.direction);
    const proposed: Candidate[] = [], missingIndexes: string[] = [], recommendations: string[] = [];
    const names = new Set(indexes.keys());
    for (const candidate of candidates.sort((a, b) => b.columns.length - a.columns.length)) {
        if (candidate.columns.length > 16 || candidate.columns.some(c => !indexable.has(c))) continue;
        const matches = [...indexes.values()].filter(index => !index.expression && !index.partial && covers(index, candidate));
        if (matches.some(index => !index.inactive) || proposed.some(index => covers(index, candidate))) continue;
        if (matches.length) {
            recommendations.push(`Review inactive index ${quote(matches[0].name)} on ${quote(table.value)} instead of creating a duplicate. No activation was performed.`);
            continue;
        }
        const key = JSON.stringify([table.value, candidate.columns, candidate.direction]);
        const stem = `IDX_${table.value.replace(/[^A-Za-z0-9_]/g, '_')}`.slice(0, 20);
        let name = '';
        for (let n = 0; n < 100; n++) {
            name = `${stem}_${createHash('sha256').update(`${key}:${n}`).digest('hex').slice(0, 8).toUpperCase()}`;
            if (!names.has(name)) break;
        }
        if (names.has(name)) continue;
        names.add(name); proposed.push(candidate);
        missingIndexes.push(`CREATE ${candidate.direction ? 'DESCENDING ' : ''}INDEX ${quote(name)} ON ${quote(table.value)} (${candidate.columns.map(quote).join(', ')});`);
    }
    recommendations.push('Suggestions are catalog-checked heuristics, not guaranteed performance improvements. Review selectivity, key-size limits and the actual plan before manually applying any DDL. Inactive, partial and expression indexes are not treated as general active coverage.');
    return { missingIndexes, recommendations: [...new Set(recommendations)], success: true };
}
