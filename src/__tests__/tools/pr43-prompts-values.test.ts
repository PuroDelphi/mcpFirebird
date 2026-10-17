jest.mock('../../db/driver-factory.js', () => ({ DriverFactory: {} }));
import { setupTemplatePrompts } from '../../prompts/templates.js';
import { setupAdvancedTemplatePrompts } from '../../prompts/advanced-templates.js';
import { toolResult } from '../../tools/contracts.js';
import { normalizePureJsDates } from '../../db/connection.js';

describe('PR43 prompt defaults and scoped value conversion', () => {
    const prompts = new Map([...setupTemplatePrompts(), ...setupAdvancedTemplatePrompts()]);
    it.each([
        ['migration-planning', 'migrationType', 'schema-change', 'SCHEMA CHANGE'],
        ['query-optimization-guide', 'queryType', 'select', 'SELECT'],
        ['database-health-check', 'focusAreas', 'performance', 'Performance'],
        ['security-audit', 'auditScope', 'encryption', 'Encryption']
    ])('%s accepts omitted, placeholder and valid arguments', async (name, key, valid) => {
        const prompt = prompts.get(name)!;
        for (const args of [{}, { [key]: '$1' }, { [key]: valid }]) {
            const result = await prompt.handler(prompt.inputSchema.parse(args));
            expect(result.messages[0].content.text).toBeTruthy();
            expect(result.messages[0].content.text).not.toContain('undefined');
        }
        const parsed = prompt.inputSchema.parse({ [key]: valid }) as any;
        expect(parsed[key]).toEqual(['focusAreas', 'auditScope'].includes(key) ? [valid] : valid);
    });
    it('does not change binary or unrelated Date serialization in shared tool results', () => {
        const binary = Buffer.from([255, 0, 128]); const date = new Date('2026-09-04T20:12:26.985Z');
        expect(toolResult({ binary, date }).structuredContent.result).toEqual({ binary: binary.toJSON(), date: date.toISOString() });
    });
    it('normalizes only database Date columns without decoding Buffers or recursing into arbitrary objects', () => {
        const binary = Buffer.from([255, 0]); const nested = { date: new Date() };
        const result = normalizePureJsDates([{ WHEN: new Date(2026, 8, 4, 23, 12, 26, 985), binary, nested }]);
        expect(result[0].WHEN).toBe('2026-09-04 23:12:26.985');
        expect(result[0].binary).toBe(binary); expect(result[0].nested).toBe(nested);
        expect(() => normalizePureJsDates([{ WHEN: new Date(NaN) }])).toThrow('Invalid Firebird date');
    });
});
