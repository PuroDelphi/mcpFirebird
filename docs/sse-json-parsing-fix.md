# SSE JSON Parsing Bug Fix

## Overview

This document describes the fix for a critical bug in the SSE (Server-Sent Events) transport implementation where POST requests to the `/messages` endpoint failed to parse JSON body correctly.

## Problem Description

### Original Issue

When the MCP Firebird server was running in unified or SSE transport mode, it failed to correctly parse the body of POST requests sent to the `/messages` endpoint, creating a catch-22 situation:

1. **With `Content-Type: application/json`**: Server responded with `400 Bad Request` and error message `Invalid message: [object Object]`
2. **With `Content-Type: text/plain`**: Server responded with `unsupported content-type: text/plain` error

This prevented clients from successfully sending requests to the SSE endpoint.

### Root Cause

The issue was caused by missing JSON parsing middleware in the SSE router. While the unified server configured `express.json()` middleware globally, the SSE router created in `src/server/sse.ts` didn't have access to this middleware, causing request bodies to remain unparsed.

## Solution

### 1. Added JSON Parsing Middleware to SSE Router

```typescript
// Add JSON parsing middleware to the router
router.use(express.json({ limit: '10mb' }));

// Add text parsing for text/plain content type (fallback for some clients)
router.use(express.text({ limit: '10mb', type: 'text/plain' }));

// Add URL-encoded parsing for form data
router.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

### 2. Custom Content-Type Handling

Added custom middleware to handle edge cases where clients send JSON data with `text/plain` content type:

```typescript
router.use('/messages', (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    
    // If content-type is text/plain but body looks like JSON, try to parse it
    if (contentType.includes('text/plain') && typeof req.body === 'string') {
        try {
            const trimmedBody = req.body.trim();
            if ((trimmedBody.startsWith('{') && trimmedBody.endsWith('}')) || 
                (trimmedBody.startsWith('[') && trimmedBody.endsWith(']'))) {
                req.body = JSON.parse(trimmedBody);
                logger.debug('Successfully parsed JSON from text/plain content');
            }
        } catch (error) {
            logger.warn('Failed to parse JSON from text/plain content:', { error });
            // Continue with original body
        }
    }
    
    next();
});
```

### 3. Enhanced Error Handling

Improved error handling in the `/messages` endpoint with better validation and logging:

```typescript
// Validate request body
if (!req.body) {
    logger.warn(`POST /messages called with empty body for session: ${sessionId}`);
    res.status(400).json({
        jsonrpc: '2.0',
        error: {
            code: -32602,
            message: 'Invalid request: empty body'
        },
        id: null
    });
    return;
}

// Log request details for debugging
logger.debug(`Processing POST message for session: ${sessionId}`, {
    contentType: req.headers['content-type'],
    bodyType: typeof req.body,
    bodyKeys: typeof req.body === 'object' ? Object.keys(req.body) : 'N/A'
});
```

## Testing

### Automated Tests

Created comprehensive tests in `src/__tests__/server/sse-json-parsing.test.js` that validate:

1. **JSON Parsing Logic**: Ensures valid JSON is parsed correctly from text/plain content
2. **Error Handling**: Validates graceful handling of malformed JSON
3. **Content-Type Detection**: Tests proper identification of different content types
4. **Bug Fix Validation**: Specifically tests the scenarios described in the original bug report

### Test Results

All tests pass successfully, confirming that:
- ✅ Valid JSON from text/plain content is parsed correctly
- ✅ Malformed JSON is handled gracefully without crashing
- ✅ Array JSON is processed correctly
- ✅ Non-JSON text is left unchanged
- ✅ Different content-type variations are identified correctly
- ✅ The original "[object Object]" error is prevented
- ✅ The catch-22 scenario is resolved

## Usage

### For Clients

Clients can now send POST requests to the `/messages` endpoint using either:

1. **Recommended**: `Content-Type: application/json`
   ```javascript
   fetch('/messages?sessionId=your-session-id', {
       method: 'POST',
       headers: {
           'Content-Type': 'application/json'
       },
       body: JSON.stringify({
           jsonrpc: '2.0',
           method: 'tools/list',
           id: 1
       })
   });
   ```

2. **Fallback**: `Content-Type: text/plain` (automatically parsed if JSON-like)
   ```javascript
   fetch('/messages?sessionId=your-session-id', {
       method: 'POST',
       headers: {
           'Content-Type': 'text/plain'
       },
       body: '{"jsonrpc":"2.0","method":"tools/list","id":1}'
   });
   ```

### Server Configuration

No additional configuration is required. The fix is automatically applied when using:
- `--transport-type unified`
- `--transport-type sse`
- `--transport-type http`

## Backward Compatibility

This fix maintains full backward compatibility:
- Existing clients using `application/json` will continue to work
- Clients that were using `text/plain` as a workaround will also continue to work
- No breaking changes to the API

## Files Modified

1. `src/server/sse.ts` - Added JSON parsing middleware and enhanced error handling
2. `src/__tests__/server/sse-json-parsing.test.js` - Added comprehensive tests
3. `src/__tests__/setup/jest.setup.js` - Test setup configuration
4. `jest.config.js` - Updated to support both TypeScript and JavaScript tests
5. `tsconfig.json` - Added `isolatedModules: true` and included test files

## Related Issues

This fix resolves the issue where clients experienced:
- `400 Bad Request` with `Invalid message: [object Object]` error
- `unsupported content-type: text/plain` error
- Inability to successfully communicate with the SSE endpoint

The fix ensures robust JSON parsing for all supported content types while maintaining excellent error handling and debugging capabilities.
