# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**This is an UNOFFICIAL Notion MCP Server.** It is not affiliated with or endorsed by Notion.

This is an [MCP (Model Context Protocol)](https://spec.modelcontextprotocol.io/) server that exposes the [Notion API](https://developers.notion.com/reference/intro) as MCP tools. It auto-generates tools from an OpenAPI specification.

## Architecture

```
scripts/notion-openapi.json    # OpenAPI spec (source of truth for all tools)
        ↓
src/init-server.ts             # Loads & validates spec, creates MCPProxy
        ↓
src/openapi-mcp-server/
├── openapi/parser.ts          # Converts OpenAPI → MCP tools
├── mcp/proxy.ts               # Registers tools with MCP server
└── client/http-client.ts      # Executes API calls
```

## Key Patterns

### Adding New Endpoints

Only modify `scripts/notion-openapi.json`. Tools are auto-generated from the spec - no code changes needed elsewhere.

### Tool Generation Flow

1. `OpenAPIToMCPConverter.convertToMCPTools()` iterates all paths/operations
2. Each operation becomes an MCP tool (name = `operationId`)
3. Parameters + requestBody → `inputSchema`
4. Response schema → `returnSchema`
5. `MCPProxy.setupHandlers()` registers tools with the MCP SDK

### Schema Resolution (`$ref` Handling)

The parser converts OpenAPI `#/components/schemas/` refs to JSON Schema `#/$defs/` format. It uses caching to handle circular references and avoid infinite recursion. When `resolveRefs: false`, refs are preserved as `$ref` nodes; when `true`, they're fully expanded in-place.

### Double-Serialization Fix

Some MCP clients double-serialize nested object parameters (sending JSON strings instead of objects). `MCPProxy` includes `deserializeParams()` (line 33) to detect and fix this:
- Detects strings that look like JSON objects/arrays
- Recursively parses and deserializes nested parameters
- Preserves actual string values
- See: https://github.com/makenotion/notion-mcp-server/issues/176

### Naming Conventions

- Tool names come from OpenAPI `operationId` (e.g., `retrieve-a-database`)
- Names are truncated to 64 chars and converted to title case for display

## Common Commands

```bash
npm run build              # TypeScript compilation + CLI bundling
npm test                   # Run vitest tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Run tests with coverage
npm run dev                # Start dev server with hot reload (tsx watch)
```

### Testing Single Files

```bash
npx vitest run path/to/test.test.ts
```

## File Structure

- `scripts/notion-openapi.json` - OpenAPI 3.1.0 spec defining all Notion API endpoints
- `scripts/start-server.ts` - Entry point
- `scripts/build-cli.js` - CLI bundler (esbuild)
- `src/init-server.ts` - Server initialization
- `src/openapi-mcp-server/` - Core MCP server implementation
  - `openapi/parser.ts` - OpenAPI to MCP conversion
  - `mcp/proxy.ts` - MCP tool registration and execution
  - `client/http-client.ts` - HTTP request execution with openapi-client-axios

## Testing

Tests are in `__tests__` directories adjacent to source files using vitest.

Key test patterns:
- Helper functions like `verifyToolMethod()` and `verifyTools()` for schema validation
- `getTypeFromSchema()` handles complex schema types for testing
- Integration tests use real OpenAPI specs

## Transport Modes

The server supports two transport modes:

### STDIO (default)
Standard MCP transport used by Claude Desktop, Cursor, etc.

### Streamable HTTP
For web-based applications:
```bash
npx @notionhq/notion-mcp-server --transport http --port 3000
```
Requires bearer token auth (auto-generated or via `--auth-token`/`AUTH_TOKEN`).

## API Version

Uses Notion API version `2025-09-03` (Data Source Edition). Breaking change from v1.x:
- `/v1/databases/{database_id}` endpoints replaced with `/v1/data_sources/{data_source_id}`
- `post-database-query` → `query-data-source`
- `update-a-database` → `update-a-data-source`
- `create-a-database` → `create-a-data-source`

## Authentication

Two environment variable options:
- `NOTION_TOKEN` (recommended): Bearer token format, auto-includes Notion-Version header
- `OPENAPI_MCP_HEADERS` (advanced): JSON object with custom headers

## Known Limitations

The server has been significantly improved but still has some limitations. See `TO_FIX.md` for comprehensive list of identified issues:

### Recently Addressed (as of 2025-02)
- ✅ Block types expanded from 2 to 19+ types (headings, code, quote, callout, image, video, etc.)
- ✅ Filter schemas added for 9 property types (checkbox, date, files, multiSelect, number, people, relation, richText, select)
- ✅ Timestamp sorting support added to sortObject
- ✅ Templates list response schema added
- ✅ post-page.children items schema fixed

### Remaining Limitations
- Compound filters (AND/OR nesting) not fully defined
- Response schemas for some data source endpoints still empty
- Property type schemas incomplete (only dataSourceProperty defined)
- No batch operations (API limitation)
- Manual pagination required for large result sets
