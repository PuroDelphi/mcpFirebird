/** Compatibility factory. All callers now receive the same complete catalog. */
import { createMcpServerInstance } from './index.js';
import { initSecurity } from '../security/index.js';
export async function createServer() {
    await initSecurity();
    return { server: await createMcpServerInstance() };
}
