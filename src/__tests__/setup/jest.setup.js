/**
 * Jest setup file for MCP Firebird tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock console methods to reduce noise during tests
const originalConsole = { ...console };

beforeAll(() => {
    // Mock console methods but keep error for important test failures
    console.log = jest.fn();
    console.info = jest.fn();
    console.warn = jest.fn();
    console.debug = jest.fn();
});

afterAll(() => {
    // Restore console methods
    Object.assign(console, originalConsole);
});

// Global test timeout
jest.setTimeout(30000);
