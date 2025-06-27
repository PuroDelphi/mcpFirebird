/**
 * Session Manager for MCP Firebird Server
 * Provides robust session management with automatic cleanup, configurable timeouts,
 * and comprehensive error handling for both SSE and Streamable HTTP transports
 */

import { EventEmitter } from 'events';
import { createLogger } from './logger.js';

const logger = createLogger('session-manager');

export interface SessionData {
    id: string;
    type: 'sse' | 'streamable-http';
    transport: any; // Transport instance
    server?: any; // Server instance (for stateful modes)
    createdAt: Date;
    lastActivity: Date;
    metadata?: Record<string, any>;
}

export interface SessionManagerConfig {
    sessionTimeoutMs?: number;
    cleanupIntervalMs?: number;
    maxSessions?: number;
    enableMetrics?: boolean;
}

export interface SessionMetrics {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    cleanupRuns: number;
    averageSessionDuration: number;
    sessionsByType: Record<string, number>;
}

/**
 * Centralized session manager for MCP transports
 */
export class SessionManager extends EventEmitter {
    private sessions: Map<string, SessionData> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private metrics: SessionMetrics;
    private config: Required<SessionManagerConfig>;

    constructor(config: SessionManagerConfig = {}) {
        super();
        
        this.config = {
            sessionTimeoutMs: config.sessionTimeoutMs || 1800000, // 30 minutes
            cleanupIntervalMs: config.cleanupIntervalMs || 60000, // 1 minute
            maxSessions: config.maxSessions || 1000,
            enableMetrics: config.enableMetrics ?? true
        };

        this.metrics = {
            totalSessions: 0,
            activeSessions: 0,
            expiredSessions: 0,
            cleanupRuns: 0,
            averageSessionDuration: 0,
            sessionsByType: {}
        };

        this.startCleanupTimer();
        logger.info('Session manager initialized', { config: this.config });
    }

    /**
     * Creates a new session
     */
    createSession(
        id: string, 
        type: 'sse' | 'streamable-http', 
        transport: any, 
        server?: any,
        metadata?: Record<string, any>
    ): SessionData {
        // Check session limits
        if (this.sessions.size >= this.config.maxSessions) {
            const oldestSession = this.getOldestSession();
            if (oldestSession) {
                logger.warn(`Session limit reached, removing oldest session: ${oldestSession.id}`);
                this.removeSession(oldestSession.id);
            }
        }

        const sessionData: SessionData = {
            id,
            type,
            transport,
            server,
            createdAt: new Date(),
            lastActivity: new Date(),
            metadata: metadata || {}
        };

        this.sessions.set(id, sessionData);
        
        // Update metrics
        if (this.config.enableMetrics) {
            this.metrics.totalSessions++;
            this.metrics.activeSessions++;
            this.metrics.sessionsByType[type] = (this.metrics.sessionsByType[type] || 0) + 1;
        }

        logger.info(`Session created: ${id} (type: ${type})`);
        this.emit('sessionCreated', sessionData);
        
        return sessionData;
    }

    /**
     * Gets a session by ID
     */
    getSession(id: string): SessionData | undefined {
        const session = this.sessions.get(id);
        if (session) {
            session.lastActivity = new Date();
        }
        return session;
    }

    /**
     * Updates session activity timestamp
     */
    updateActivity(id: string): boolean {
        const session = this.sessions.get(id);
        if (session) {
            session.lastActivity = new Date();
            return true;
        }
        return false;
    }

    /**
     * Removes a session
     */
    removeSession(id: string): boolean {
        const session = this.sessions.get(id);
        if (!session) {
            return false;
        }

        try {
            // Close transport
            if (session.transport && typeof session.transport.close === 'function') {
                session.transport.close();
            }

            // Close server if present
            if (session.server && typeof session.server.close === 'function') {
                session.server.close();
            }
        } catch (error) {
            logger.warn(`Error closing resources for session ${id}:`, { error });
        }

        this.sessions.delete(id);
        
        // Update metrics
        if (this.config.enableMetrics) {
            this.metrics.activeSessions--;
            const duration = new Date().getTime() - session.createdAt.getTime();
            this.updateAverageSessionDuration(duration);
        }

        logger.info(`Session removed: ${id}`);
        this.emit('sessionRemoved', session);
        
        return true;
    }

    /**
     * Gets all active sessions
     */
    getAllSessions(): SessionData[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Gets sessions by type
     */
    getSessionsByType(type: 'sse' | 'streamable-http'): SessionData[] {
        return Array.from(this.sessions.values()).filter(session => session.type === type);
    }

    /**
     * Gets expired sessions
     */
    getExpiredSessions(): SessionData[] {
        const now = new Date();
        return Array.from(this.sessions.values()).filter(session => 
            now.getTime() - session.lastActivity.getTime() > this.config.sessionTimeoutMs
        );
    }

    /**
     * Performs cleanup of expired sessions
     */
    cleanup(): number {
        const expiredSessions = this.getExpiredSessions();
        let cleanedCount = 0;

        for (const session of expiredSessions) {
            if (this.removeSession(session.id)) {
                cleanedCount++;
            }
        }

        if (this.config.enableMetrics) {
            this.metrics.expiredSessions += cleanedCount;
            this.metrics.cleanupRuns++;
        }

        if (cleanedCount > 0) {
            logger.info(`Cleaned up ${cleanedCount} expired sessions`);
            this.emit('cleanup', { cleanedCount, totalSessions: this.sessions.size });
        }

        return cleanedCount;
    }

    /**
     * Gets current metrics
     */
    getMetrics(): SessionMetrics {
        return { ...this.metrics };
    }

    /**
     * Resets metrics
     */
    resetMetrics(): void {
        this.metrics = {
            totalSessions: 0,
            activeSessions: this.sessions.size,
            expiredSessions: 0,
            cleanupRuns: 0,
            averageSessionDuration: 0,
            sessionsByType: {}
        };
        logger.info('Metrics reset');
    }

    /**
     * Graceful shutdown - closes all sessions
     */
    async shutdown(): Promise<void> {
        logger.info('Starting session manager shutdown...');
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        const sessionIds = Array.from(this.sessions.keys());
        const promises = sessionIds.map(id => 
            new Promise<void>(resolve => {
                try {
                    this.removeSession(id);
                } catch (error) {
                    logger.warn(`Error removing session ${id} during shutdown:`, { error });
                }
                resolve();
            })
        );

        await Promise.all(promises);
        
        logger.info(`Session manager shutdown completed. Closed ${sessionIds.length} sessions.`);
        this.emit('shutdown');
    }

    /**
     * Starts the cleanup timer
     */
    private startCleanupTimer(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, this.config.cleanupIntervalMs);
    }

    /**
     * Gets the oldest session (for eviction when limit is reached)
     */
    private getOldestSession(): SessionData | null {
        let oldest: SessionData | null = null;
        
        for (const session of this.sessions.values()) {
            if (!oldest || session.createdAt < oldest.createdAt) {
                oldest = session;
            }
        }
        
        return oldest;
    }

    /**
     * Updates the average session duration metric
     */
    private updateAverageSessionDuration(newDuration: number): void {
        const totalSessions = this.metrics.totalSessions;
        if (totalSessions > 0) {
            this.metrics.averageSessionDuration = 
                (this.metrics.averageSessionDuration * (totalSessions - 1) + newDuration) / totalSessions;
        }
    }
}
