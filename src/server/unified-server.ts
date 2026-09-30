/** Compatibility facade over the shared HTTP application. */
import type cors from 'cors';
import type { Server } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/server';
import { createHttpApplication } from './http-server.js';
import { loadHttpSecurityConfig } from './http-security.js';
import { initSecurity } from '../security/index.js';

export interface UnifiedServerConfig {
    port?: number;
    enableSSE?: boolean;
    enableStreamableHttp?: boolean;
    corsOptions?: cors.CorsOptions;
    /** @deprecated Session lifetime is configured using STREAMABLE_SESSION_TIMEOUT_MS. */
    sessionConfig?: { sessionTimeoutMs?: number; cleanupIntervalMs?: number; maxSessions?: number };
}
export class UnifiedMcpServer {
    private http?: ReturnType<typeof createHttpApplication>;
    private listener?: Server;
    constructor(private factory: () => Promise<McpServer>, private config: UnifiedServerConfig = {}) {}
    async start(): Promise<void> {
        await initSecurity();
        const security = loadHttpSecurityConfig();
        this.http = createHttpApplication(this.factory, security, this.config);
        await new Promise<void>((resolve, reject) => {
            this.listener = this.http!.app.listen(this.config.port ?? 3003, security.host, () => resolve());
            this.listener.once('error', reject);
        });
    }
    async stop(): Promise<void> {
        await this.http?.close();
        if (this.listener) await new Promise<void>((resolve, reject) => {
            this.listener!.close(error => error ? reject(error) : resolve());
        });
    }
    getMetrics() {
        return { config: { port: this.config.port ?? 3003, protocols: {
            sse: this.config.enableSSE ?? true, streamableHttp: this.config.enableStreamableHttp ?? true
        } }, uptime: process.uptime() };
    }
}
