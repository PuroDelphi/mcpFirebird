import { AsyncLocalStorage } from 'node:async_hooks';
import type { UserInfo } from './authorization.js';

export interface SecurityContext { user?: UserInfo; sessionId: string }
export const securityContext = new AsyncLocalStorage<SecurityContext>();
export const currentSecurityContext = (): SecurityContext => securityContext.getStore() || { sessionId: 'stdio' };
