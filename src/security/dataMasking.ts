import { securityConfig } from './config.js';
import { FirebirdError } from '../utils/errors.js';

/** Mask after BLOB resolution and before serializing or auditing responses. Never fail open. */
export function applyDataMasking(results: any[], aliases: Record<string, string> = {}): any[] {
    if (!securityConfig.dataMasking?.length) return results;
    try {
        return results.map(row => {
            const masked = { ...row };
            for (const rule of securityConfig.dataMasking!) {
                const regex = typeof rule.pattern === 'string' ? new RegExp(rule.pattern) : new RegExp(rule.pattern.source, rule.pattern.flags);
                for (const key of Object.keys(masked)) {
                    const column = aliases[key] || key;
                    if (rule.columns.some(name => name.toUpperCase() === column.toUpperCase()) && masked[key] != null) {
                        regex.lastIndex = 0;
                        masked[key] = String(masked[key]).replace(regex, rule.replacement);
                    }
                }
            }
            return masked;
        });
    } catch {
        throw new FirebirdError('Unable to apply data masking; result withheld', 'SECURITY_ERROR');
    }
}
