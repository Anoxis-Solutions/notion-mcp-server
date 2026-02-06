# Notion API 2025 Coverage Analysis

**Generated:** 2026-02-05T17:24:37.035Z
**API Version:** 2025-09-03
**Total Operations:** 22

## Summary by Category

| Category | Count | Percentage |
|----------|-------|------------|
| Blocks | 5 | 22.7% |
| Pages | 5 | 22.7% |
| Data Sources | 5 | 22.7% |
| Users | 3 | 13.6% |
| Comments | 2 | 9.1% |
| Search | 1 | 4.5% |
| Databases (Legacy) | 1 | 4.5% |

---

## Blocks

| Operation ID | Method | Path | Description |
|--------------|--------|------|-------------|
| delete-a-block | DELETE | `/v1/blocks/{block_id}` | Delete a block |
| retrieve-a-block | GET | `/v1/blocks/{block_id}` | Retrieve a block |
| get-block-children | GET | `/v1/blocks/{block_id}/children` | Retrieve block children |
| update-a-block | PATCH | `/v1/blocks/{block_id}` | Update a block |
| patch-block-children | PATCH | `/v1/blocks/{block_id}/children` | Append block children |

## Pages

| Operation ID | Method | Path | Description |
|--------------|--------|------|-------------|
| retrieve-a-page | GET | `/v1/pages/{page_id}` | Retrieve a page |
| retrieve-a-page-property | GET | `/v1/pages/{page_id}/properties/{property_id}` | Retrieve a page property item |
| patch-page | PATCH | `/v1/pages/{page_id}` | Update page properties |
| post-page | POST | `/v1/pages` | Create a page |
| move-page | POST | `/v1/pages/{page_id}/move` | Move a page |

## Data Sources

| Operation ID | Method | Path | Description |
|--------------|--------|------|-------------|
| retrieve-a-data-source | GET | `/v1/data_sources/{data_source_id}` | Retrieve a data source |
| list-data-source-templates | GET | `/v1/data_sources/{data_source_id}/templates` | List templates in a data source |
| update-a-data-source | PATCH | `/v1/data_sources/{data_source_id}` | Update a data source |
| create-a-data-source | POST | `/v1/data_sources` | Create a data source |
| query-data-source | POST | `/v1/data_sources/{data_source_id}/query` | Query a data source |

## Users

| Operation ID | Method | Path | Description |
|--------------|--------|------|-------------|
| get-users | GET | `/v1/users` | List all users |
| get-user | GET | `/v1/users/{user_id}` | Retrieve a user |
| get-self | GET | `/v1/users/me` | Retrieve your token's bot user |

## Comments

| Operation ID | Method | Path | Description |
|--------------|--------|------|-------------|
| retrieve-a-comment | GET | `/v1/comments` | Retrieve comments |
| create-a-comment | POST | `/v1/comments` | Create comment |

## Search

| Operation ID | Method | Path | Description |
|--------------|--------|------|-------------|
| post-search | POST | `/v1/search` | Search by title |

## Databases (Legacy)

| Operation ID | Method | Path | Description |
|--------------|--------|------|-------------|
| retrieve-a-database | GET | `/v1/databases/{database_id}` | Retrieve a database |

## API Version 2025-09-03 Changes

The Notion API version `2025-09-03` introduced breaking changes from the previous version:

### Data Sources Replace Databases
The concept of "databases" has been split into two separate entities:

1. **Database** (Container): A workspace-level object that can hold multiple data sources
2. **Data Source** (Table): The actual table/queryable content

| Old Endpoint (v1) | New Endpoint (2025) | Operation ID |
|-------------------|---------------------|--------------|
| `POST /v1/databases/{database_id}/query` | `POST /v1/data_sources/{data_source_id}/query` | `query-data-source` |
| `PATCH /v1/databases/{database_id}` | `PATCH /v1/data_sources/{data_source_id}` | `update-a-data-source` |
| `POST /v1/databases` | `POST /v1/data_sources` | `create-a-data-source` |
| `GET /v1/databases/{database_id}` | `GET /v1/data_sources/{data_source_id}` | `retrieve-a-data-source` |

### Legacy Support
The `retrieve-a-database` endpoint is retained for backward compatibility but is deprecated.

## Coverage Analysis

### All Operations Exposed

✅ All 22 operations in the OpenAPI spec are successfully converted to MCP tools.

The parser converts operations to MCP tools using this flow:
1. `OpenAPIToMCPConverter.convertToMCPTools()` iterates all paths/operations
2. Each operation becomes an MCP tool (name = `operationId`)
3. Parameters + requestBody → `inputSchema`
4. Response schema → `returnSchema`
5. `MCPProxy.setupHandlers()` registers tools with the MCP SDK

### Missing Endpoints

#### Webhooks (Not Available via API)

**Important**: Notion does NOT provide API endpoints for webhook management. Webhooks are managed exclusively through the Notion integration dashboard UI at `notion.so/my-integrations`.

- **No API endpoints exist** for creating, listing, updating, or deleting webhooks programmatically
- Webhooks are configured manually in the integration settings
- Your server only receives webhook POST requests from Notion
- See [Notion Webhooks Documentation](https://developers.notion.com/reference/webhooks)

**What this means for the MCP server**: Webhook endpoints cannot be added to the OpenAPI spec because they don't exist in the Notion API.

#### Deprecated Endpoints (Removed in 2025-09-03)
- `POST /v1/databases/{database_id}/query` - Replaced by `query-data-source`
- `PATCH /v1/databases/{database_id}` - Replaced by `update-a-data-source`
- `POST /v1/databases` - Replaced by `create-a-data-source`

### Legacy Endpoints (Deprecated)

The following endpoint is kept for backward compatibility:

| Operation ID | Status | Notes |
|--------------|--------|-------|
| retrieve-a-database | ⚠️ Deprecated | Use data source endpoints instead |

### Tool Name Validation

- Total operations: 22
- Operations with names > 64 chars: 0
- Operations requiring truncation: NO

### HTTP Method Distribution

| Method | Count | Percentage |
|--------|-------|------------|
| GET | 11 | 50.0% |
| POST | 6 | 27.3% |
| PATCH | 4 | 18.2% |
| DELETE | 1 | 4.5% |

## Recommendations

### 1. Update OpenAPI Spec
The current OpenAPI spec is comprehensive but has some limitations:
- **Block types**: Only 2 of 31+ block types are defined (see `TO_FIX.md` Issue #1)
- **Filter schemas**: Query data source filters are not fully defined (Issue #9)
- **Response schemas**: Some endpoints have incomplete response schemas (Issue #12)

### 2. Keep API Version Updated
- Current API version: `2025-09-03` (Data Source Edition)
- Major change: Database endpoints replaced with Data Source endpoints
- Monitor [Notion API Changelog](https://developers.notion.com/page/changelog) for updates

### 3. Consider Helper Functions
While not in the official API, the following helper functions would improve usability:
- Auto-pagination helpers (e.g., `queryDataSourceAll`)
- Natural language to filter converter
- Bulk operations (if Notion adds support)

## Conclusion

The Notion MCP Server exposes **22 tools** covering all operations defined in the OpenAPI specification.

### Coverage Status

- ✅ **100%** of operations in the OpenAPI spec are exposed as MCP tools
- ✅ All tools are properly registered with the MCP SDK
- ✅ Tool names are derived from operation IDs
- ✅ Descriptions include both summary and error responses
- ✅ No tool names exceed the 64-character limit
- ✅ All HTTP methods (GET, POST, PATCH, DELETE) are supported

### Known Limitations

See `TO_FIX.md` for a comprehensive list of issues, including:
- Limited block type schemas (2/31 types supported)
- Filter schemas not fully defined
- Response schemas incomplete for some endpoints
- No webhook support (by design - managed via UI)
- No batch operations (API limitation)

### Sources
- [Notion API Reference](https://developers.notion.com/reference/intro)
- [Notion API Webhooks](https://developers.notion.com/reference/webhooks)
- [Upgrading to Version 2025-09-03](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03)
- [Notion API Versioning](https://developers.notion.com/reference/versioning)

