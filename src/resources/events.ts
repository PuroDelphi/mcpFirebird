import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import { FirebirdError } from '../utils/errors.js';
import { DriverFactory } from '../db/driver-factory.js';
import { getDefaultConfig } from '../db/connection.js';

const logger = createLogger('resources:events');

// Global event manager state
let eventDbConnection: any = null;
let fbEventManager: any = null;

// Map to track active event subscriptions and their counts/last payloads
const activeEvents = new Map<string, { count: number, lastFired: Date }>();
let mcpServerInstance: any = null;

/**
 * Initializes the event manager, keeping a persistent connection open
 * to listen for events.
 */
async function getEventManager(): Promise<any> {
    if (fbEventManager) {
        return fbEventManager;
    }

    logger.debug('Initializing Firebird Event Manager...');
    
    try {
        const config = getDefaultConfig();
        const driver = await DriverFactory.getDriver();
        // The driver.attach returns a FirebirdDatabase object (which wraps the underlying connection)
        const db = await driver.attach(config);
        
        eventDbConnection = db;
        
        // We might be using the native driver or pure js. The pure JS driver instance exposes `attachEvent` 
        // directly. However, we might need to access the underlying native object if wrapped.
        // `db` has an index signature `[key: string]: any`
        const targetDb = db._nativeAttachment || db;

        if (typeof targetDb.attachEvent !== 'function') {
            const msg = 'Driver does not support attachEvent (might be using pure JS without event support?)';
            logger.error(msg);
            throw new Error(msg);
        }

        return new Promise((resolve, reject) => {
            targetDb.attachEvent((evtErr: any, evt: any) => {
                if (evtErr) {
                    logger.error('Failed to attachEvent', { error: evtErr });
                    return reject(new FirebirdError('Failed to initialize event manager', 'FIREBIRD_ERROR', evtErr));
                }
                
                fbEventManager = evt;
                
                evt.on('post_event', (name: string, count: number) => {
                    logger.info(`🔥 FIREBIRD EVENT FIRED: ${name} (count: ${count})`);
                    activeEvents.set(name, { count, lastFired: new Date() });
                    
                    if (mcpServerInstance && mcpServerInstance.server) {
                        try {
                            const uri = `firebird://events/${name}`;
                            mcpServerInstance.server.notification({
                                method: 'notifications/resources/updated',
                                params: { uri }
                            });
                            logger.debug(`Sent resource updated notification for ${uri}`);
                        } catch (notifyErr) {
                            logger.error(`Failed to send MCP notification for event ${name}`, { error: notifyErr });
                        }
                    }
                });
                
                resolve(evt);
            });
        });
    } catch (error) {
        logger.error('Failed to attach for events', { error });
        throw new FirebirdError('Failed to attach event connection', 'FIREBIRD_ERROR', error);
    }
}

/**
 * Registers one or more events to listen to.
 */
export async function registerFirebirdEvents(events: string[]): Promise<void> {
    const evtManager = await getEventManager();
    
    return new Promise((resolve, reject) => {
        evtManager.registerEvent(events, (err: any) => {
            if (err) {
                logger.error(`Failed to register events: ${events.join(', ')}`, { error: err });
                return reject(new FirebirdError('Failed to register Firebird events', 'FIREBIRD_ERROR', err));
            }
            
            for (const event of events) {
                if (!activeEvents.has(event)) {
                    activeEvents.set(event, { count: 0, lastFired: new Date() });
                }
                logger.info(`Successfully subscribed to Firebird event: ${event}`);
            }
            
            resolve();
        });
    });
}

/**
 * Configures the MCP server to handle Firebird events as resources.
 */
export function setupEventResources(server: any) {
    mcpServerInstance = server;
    
    // Expose a dynamic resource template for events
    // This allows clients to read firebird://events/{eventName}
    server.resource(
        "firebird-event",
        "firebird://events/{eventName}",
        {
            name: "Firebird Event State",
            description: "Real-time state and payload of a Firebird POST_EVENT trigger"
        },
        async (uri: URL, { eventName }: { eventName: string }) => {
            logger.debug(`Client requested event resource: ${eventName}`);
            
            const state = activeEvents.get(eventName) || { count: 0, lastFired: null };
            
            return {
                contents: [{
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify({
                        event: eventName,
                        count: state.count,
                        lastFired: state.lastFired,
                        status: activeEvents.has(eventName) ? 'subscribed' : 'unsubscribed',
                        note: "To receive proactive notifications, ensure you are subscribed to this event using the 'subscribe_to_event' tool and the MCP resources/subscribe capability."
                    }, null, 2)
                }]
            };
        }
    );
    
    // Also expose a tool to let the AI explicitly subscribe to an event if it wants
    server.tool(
        "subscribe_to_event",
        "Subscribe to a Firebird event (POST_EVENT) to receive proactive notifications",
        {
            eventName: z.string().describe("The name of the Firebird event to subscribe to (e.g. 'NEW_ORDER', 'CLIENT_UPDATED')")
        },
        async ({ eventName }: { eventName: string }) => {
            try {
                await registerFirebirdEvents([eventName]);
                return {
                    content: [{
                        type: "text",
                        text: `Successfully registered listener for Firebird event '${eventName}'. You will now receive resource update notifications for 'firebird://events/${eventName}' when the event is fired.`
                    }]
                };
            } catch (err) {
                return {
                    content: [{
                        type: "text",
                        text: `Failed to subscribe to event '${eventName}': ${err instanceof Error ? err.message : String(err)}`
                    }],
                    isError: true
                };
            }
        }
    );
}

// Clean up function to be called on shutdown
export function closeEventManager() {
    if (fbEventManager && typeof fbEventManager.close === 'function') {
        fbEventManager.close(() => {
            if (eventDbConnection) {
                eventDbConnection.detach();
                eventDbConnection = null;
            }
            logger.info('Firebird Event Manager closed');
        });
    }
}
