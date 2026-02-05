# Error Handling Implementation

This document describes the improved error handling system for the Notion MCP server.

## Overview

The error handling system provides structured, user-friendly error messages while maintaining backward compatibility and not increasing MCP context size (error information is in response content, not in tool schemas).

## Architecture

```
HttpClientError (from HTTP client)
        ↓
mapNotionErrorToMCPError() (maps to appropriate error class)
        ↓
MCPNotionError subclasses (AuthenticationError, ValidationError, etc.)
        ↓
formatUserMessage() (creates user-friendly message)
        ↓
MCP Response with { message, error } structure
```

## Error Classes

### Base Class: MCPNotionError

All errors extend from this base class which provides:
- `type`: Error type name
- `code`: Machine-readable error code
- `httpStatus`: HTTP status code
- `message`: Error message
- `retryable`: Whether the operation can be retried
- `suggestion`: User-friendly suggestion
- `operation`: Operation ID (optional)
- `params`: Request parameters (optional)

### Specific Error Types

| Error Class | HTTP Status | Code | Retryable | Use Case |
|------------|-------------|------|-----------|----------|
| `AuthenticationError` | 401, 403 | `unauthorized`, `forbidden` | No | Invalid token, missing auth |
| `ValidationError` | 400 | `validation_error` | No | Invalid parameters |
| `PermissionError` | 403 | `forbidden` | No | Insufficient permissions |
| `NotFoundError` | 404 | `object_not_found` | No | Resource not found |
| `ConflictError` | 409 | `conflict` | Yes | Concurrent modifications |
| `RateLimitError` | 429 | `rate_limited` | Yes | Rate limit exceeded |
| `ServerError` | 500+ | `internal_server_error` | Yes | Server errors |

## Response Format

When an error occurs, the MCP server returns:

```json
{
  "content": [
    {
      "type": "text",
      "text": JSON.stringify({
        "message": "🔑 **Erreur d'authentification**\n\nInvalid token\n\n**Solution** : Vérifiez que votre token NOTION_TOKEN commence par \"ntn_\" et est valide.",
        "error": {
          "type": "AuthenticationError",
          "code": "unauthorized",
          "httpStatus": 401,
          "message": "Invalid token",
          "retryable": false,
          "suggestion": "Vérifiez que votre token NOTION_TOKEN commence par \"ntn_\" et est valide.",
          "operation": "retrieve-a-page",
          "params": { "page_id": "123" }
        }
      })
    }
  ],
  "isError": true
}
```

## Error Messages

Each error type has a formatted message with:
- **Emoji** for quick visual identification
- **Bold title** in French
- **Error message** from Notion API
- **Actionable suggestion** in French

### Examples

**AuthenticationError (401)**:
```
🔑 **Erreur d'authentification**

Invalid token

**Solution** : Vérifiez que votre token NOTION_TOKEN commence par "ntn_" et est valide.
```

**ValidationError (400)**:
```
⚠️ **Erreur de validation**

The provided title is too long

**Solution** : Le champ "title" est invalide ou manquant.
```

**NotFoundError (404)**:
```
🔍 **Ressource non trouvée**

Page not found

**Détails** : La ressource de type "page" n'existe pas ou n'est pas partagée avec votre intégration.
```

**RateLimitError (429)**:
```
⏱️ **Limite de requêtes atteinte**

Rate limit exceeded

**Action** : Attendez 30 seconde(s) avant de réessayer.
```

## Implementation Details

### Error Mapping

The `mapNotionErrorToMCPError()` function in `proxy.ts`:

1. Extracts HTTP status and response data from `HttpClientError`
2. Parses Notion API error structure (message, code, field, retry_after)
3. Maps to appropriate error class based on status code
4. Infers resource type from operation name for better messages
5. Preserves operation ID and params for debugging

### Message Formatting

The `formatUserMessage()` function in `error-formatter.ts`:

1. Uses `instanceof` checks to determine error type
2. Returns formatted message with emoji, title, and suggestion
3. Provides consistent structure across all error types

### Proxy Integration

In `proxy.ts`, the error handling:

1. Catches `HttpClientError` in tool execution
2. Maps to appropriate MCP error class
3. Formats user-friendly message
4. Returns structured response with both message and error details
5. Sets `isError: true` flag for MCP clients

## Testing

### Error Classes Tests

Location: `src/openapi-mcp-server/mcp/__tests__/errors.test.ts`

Tests cover:
- Each error type creation and properties
- JSON serialization
- HTTP status mapping (400, 401, 403, 404, 409, 429, 500+)
- Operation and params preservation
- Resource type inference from operation names
- Notion API error data extraction
- Retry-After header handling

### Error Formatter Tests

Location: `src/openapi-mcp-server/mcp/__tests__/error-formatter.test.ts`

Tests cover:
- Message formatting for each error type
- Emoji and markdown structure
- Actionable suggestions
- Clear and actionable messages

## Usage Examples

### For MCP Clients

When a tool call fails, check the `isError` flag and parse the response:

```typescript
const result = await callTool('retrieve-a-page', { page_id: '123' })

if (result.isError) {
  const { message, error } = JSON.parse(result.content[0].text)

  // Display user-friendly message
  console.log(message)

  // Use structured error for programmatic handling
  if (error.code === 'rate_limited') {
    // Wait and retry
  } else if (error.retryable) {
    // Retry with exponential backoff
  }
}
```

### For Developers

To add new error types:

1. Create error class extending `MCPNotionError`
2. Add mapping case in `mapNotionErrorToMCPError()`
3. Add formatter branch in `formatUserMessage()`
4. Add tests for the new error type

## Key Design Decisions

### No MCP Context Impact

Error information is **only in response content**, not in tool schemas or input parameters. This means:
- No increase to MCP context size
- No changes to tool definitions
- Backward compatible with existing clients

### French Language for Suggestions

User-facing suggestions are in French to match the existing codebase. Error messages from Notion API are preserved in their original language (English).

### Resource Type Inference

The system infers resource types from operation names to provide more helpful messages:
- `retrieve-a-page` → "page"
- `retrieve-a-block` → "block"
- `query-a-database` → "database"
- `query-a-data-source` → "database"
- `retrieve-a-user` → "user"

### Retryable Flag

Errors are marked as retryable to help clients implement automatic retry logic:
- **Retryable**: 409, 429, 500+
- **Not retryable**: 400, 401, 403, 404

## Files Modified

- `src/openapi-mcp-server/mcp/errors.ts` - Error class definitions
- `src/openapi-mcp-server/mcp/error-formatter.ts` - Message formatter
- `src/openapi-mcp-server/mcp/proxy.ts` - Error handling integration
- `src/openapi-mcp-server/mcp/__tests__/errors.test.ts` - Error class tests
- `src/openapi-mcp-server/mcp/__tests__/error-formatter.test.ts` - Formatter tests

## Verification

Run tests:
```bash
npm test -- src/openapi-mcp-server/mcp/__tests__/
```

Run build:
```bash
npm run build
```

Verify no inputSchema changes:
```bash
# Compare tool definitions before/after
npm run dev
# In another terminal, inspect tools list
```

## Future Enhancements

Possible improvements:
1. Internationalization support for suggestions
2. Custom error codes for Notion-specific errors
3. Error aggregation for batch operations
4. Detailed error context (request ID, timestamp)
5. Telemetry for error monitoring
