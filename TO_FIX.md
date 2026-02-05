# Notion MCP Server - Limitations to Fix

This document tracks the critical design limitations identified in the Notion MCP Server that impact common Notion use cases.

## Severity Levels

- **CRITICAL**: Blocks core use cases, makes the server practically unusable
- **MAJOR**: Significantly impacts user experience
- **MODERATE**: Workarounds possible but inefficient

---

## 🔴 CRITICAL ISSUES

### 1. Block Types Extremely Limited (2/31 types supported)

**Location**: `scripts/notion-openapi.json` lines 197-262

**Current State**:
```json
"blockObjectRequest": {
  "anyOf": [
    { "$ref": "#/components/schemas/paragraphBlockRequest" },
    { "$ref": "#/components/schemas/bulletedListItemBlockRequest" }
  ]
}
```

**Missing Block Types**:
- `heading_1`, `heading_2`, `heading_3` - Essential for document structure
- `numbered_list_item` - Numbered lists
- `to_do` - Checkboxes and tasks
- `code` - Code blocks with syntax highlighting
- `quote` - Blockquotes
- `callout` - Colored callout boxes with emoji
- `divider` - Horizontal separators
- `toggle` - Collapsible sections
- `table`, `table_row` - Tables
- `image`, `video`, `file`, `pdf` - Media blocks
- `bookmark`, `embed` - Links and embeds
- `column_list`, `column` - Multi-column layouts
- `child_database`, `child_page` - Nested pages/databases
- `synced_block` - Synced blocks
- `table_of_contents` - TOC
- `equation` - Math formulas
- `breadcrumb` - Breadcrumb navigation
- `link_preview` - Link previews
- `and more...` (31 total types in Notion API)

**Impact**:
- **Use Case 1 (Create structured page)**: IMPOSSIBLE
- **Use Case 5 (Create page from template)**: IMPOSSIBLE

**Example of what CANNOT be created**:
```javascript
// Impossible to create:
{
  type: "heading_1",        // ❌ Not supported
  heading_1: { rich_text: [{ text: { content: "Documentation" } }] }

  type: "paragraph",         // ✅ Supported
  paragraph: { ... }

  type: "heading_2",        // ❌ Not supported
  heading_2: { ... }

  type: "code",             // ❌ Not supported
  code: { language: "javascript", rich_text: [...] }

  type: "to_do",            // ❌ Not supported
  to_do: { checked: false, rich_text: [...] }
}
```

**Fix Required**: Add all missing block type schemas to `components/schemas` in the OpenAPI spec.

**Reference**: https://developers.notion.com/reference/block

---

### 2. Search Limited to Titles Only

**Location**: `scripts/notion-openapi.json` line 567

**Current State**:
```json
{
  "operationId": "post-search",
  "requestBody": {
    "query": {
      "type": "string",
      "description": "The text that the API compares page and database titles against."
    }
  }
}
```

**Impact**:
- **Use Case 2 (Search content in workspace)**: SEVERELY LIMITED

**Example**:
```
Page title: "Meeting Notes - 2024-01-15"
Content: "We decided to use Kubernetes for deployment..."

Search query: "Kubernetes"
Result: NO RESULTS (because "Kubernetes" is not in the title)
```

**Note**: This is a limitation of the Notion API itself, but the MCP server could provide an abstraction layer (e.g., local indexing).

---

## 🟡 MAJOR ISSUES

### 3. No Batch Operations

**Current State**: Every operation works on a single resource. No batch endpoints exposed.

**Impact**:
- **Use Case 3 (Update multiple resources at once)**: IMPOSSIBLE

**Example**:
```javascript
// To mark 50 pages as archived:
for (const pageId of fiftyPages) {
  await patchPage({ page_id: pageId, properties: { archived: true } })
  // 50 API calls = ~10 seconds minimum, risk of timeout
}
```

**Fix Required**: Consider adding helper methods like:
- `batchUpdatePages` - Update multiple pages
- `batchUpdateBlocks` - Update multiple blocks

**Note**: The Notion API itself doesn't provide batch operations, so this would require server-side queuing logic.

---

### 4. Manual Pagination (Max 100 items per page)

**Location**: All list endpoints (`get-block-children`, `query-data-source`, `post-search`, etc.)

**Current State**:
```json
"page_size": {
  "type": "integer",
  "default": 100,
  "description": "Maximum: 100"
}
```

**Impact**:
- **Use Case 4 (List and traverse a database)**: INEFFICIENT

**Example**:
```javascript
// To fetch 1000 items from a database:
let allResults = []
let cursor = undefined
do {
  const response = await queryDataSource({
    data_source_id: "xxx",
    start_cursor: cursor,
    page_size: 100
  })
  allResults.push(...response.results)
  cursor = response.next_cursor
} while (response.has_more)
// 10 sequential API calls required
```

**Fix Required**: Add convenience methods that handle pagination automatically:
- `queryDataSourceAll` - Returns all results with automatic pagination
- `getBlockChildrenAll` - Returns all children with automatic pagination

---

### 5. `post-page.children` Incorrectly Typed

**Location**: `scripts/notion-openapi.json` lines 1242-1247

**Current State**:
```json
{
  "operationId": "post-page",
  "requestBody": {
    "children": {
      "type": "array",
      "description": "The content to be rendered on the new page",
      "items": {
        "type": "string"  // ❌ WRONG - should be blockObjectRequest
      }
    }
  }
}
```

**Impact**:
- Schema inconsistency with description
- May cause validation errors
- Even if fixed, limited to only 2 block types (see Issue #1)

**Fix Required**:
```json
"items": {
  "$ref": "#/components/schemas/blockObjectRequest"
}
```

---

## 🟢 MODERATE ISSUES

### 6. Filter Schema Not Defined

**Location**: `scripts/notion-openapi.json` line 1683

**Current State**:
```json
{
  "operationId": "query-data-source",
  "requestBody": {
    "filter": {
      "type": "object",
      "description": "Filter conditions for querying the data source"
      // ❌ No schema defined - what properties are available?
    }
  }
}
```

**Impact**: AI doesn't know the filter structure (operators, property types, AND/OR logic)

**Fix Required**: Define the complete filter schema with all supported operators.

**Reference**: https://developers.notion.com/reference/post-database-query

---

### 7. No Webhook Support

**Current State**: No webhook endpoints exposed in the spec.

**Impact**:
- No real-time reactivity to changes
- Polling required for change detection
- Cannot build notification workflows

**Note**: The Notion API supports webhooks, but they are not included in the OpenAPI spec.

---

### 8. Block Update Very Limited

**Location**: `scripts/notion-openapi.json` lines 881-959

**Current State**:
```json
{
  "operationId": "update-a-block",
  "type": {
    "description": "Currently only text (for supported block types) and checked (for to_do blocks) fields can be updated."
  }
}
```

**Limitations**:
- Cannot change block type (e.g., convert paragraph to heading)
- Cannot move/reorganize blocks
- `to_do` blocks not even defined in the schema

---

## 🔴 DATABASE/DATA SOURCE CRITICAL ISSUES

### 9. Filter Schema Completely Undefined (CRITICAL for Databases)

**Location**: `scripts/notion-openapi.json` line 1683

**Current State**:
```json
"filter": {
  "type": "object",
  "description": "Filter conditions for querying the data source"
  // ❌ NO SCHEMA - AI cannot construct valid queries!
}
```

**What the AI CANNOT do**:
- **No filter structure knowledge** - AI doesn't know filters need `property`, operator, and value
- **No operator documentation** - AI doesn't know about `equals`, `contains`, `greater_than`, etc.
- **No property type awareness** - AI doesn't know which operators work with which types
- **No compound filters** - AI cannot create AND/OR nested filters
- **Cannot validate queries** - No schema means AI must guess and fail

**Real Notion Filter Structure (NOT documented)**:
```json
{
  "filter": {
    "and": [
      {
        "property": "Status",
        "select": { "equals": "In Progress" }
      },
      {
        "property": "Priority",
        "number": { "greater_than": 3 }
      }
    ]
  }
}
```

**Impact**:
- **"Find high priority tasks assigned to me"** - IMPOSSIBLE
- **"Find tasks created this week OR due tomorrow"** - IMPOSSIBLE
- **"Find expenses > $1000 from last month"** - IMPOSSIBLE

**All Undocumented Operators (13 property types)**:
| Type | Operators | Status |
|------|-----------|--------|
| `text` | equals, contains, starts_with, ends_with, is_empty | ❌ Not documented |
| `number` | equals, greater_than, less_than, is_empty | ❌ Not documented |
| `checkbox` | equals, does_not_equal | ❌ Not documented |
| `select` | equals, does_not_equal, is_empty | ❌ Not documented |
| `multi_select` | contains, does_not_contain | ❌ Not documented |
| `date` | before, after, on_or_before, past_week, next_month | ❌ Not documented |
| `people` | contains, does_not_contain | ❌ Not documented |
| `files` | is_empty, is_not_empty | ❌ Not documented |
| `relation` | contains, does_not_contain | ❌ Not documented |

**Fix Required**: Define complete filter schemas in `components/schemas`:
```json
"QueryFilter": {
  "oneOf": [
    { "$ref": "#/components/schemas/CompoundFilter" },
    { "$ref": "#/components/schemas/PropertyFilter" }
  ]
},
"CompoundFilter": {
  "type": "object",
  "properties": {
    "and": { "type": "array", "items": { "$ref": "#/components/schemas/QueryFilter" } },
    "or": { "type": "array", "items": { "$ref": "#/components/schemas/QueryFilter" } }
  }
}
```

**Reference**: https://developers.notion.com/reference/filter-data-source-entries

---

### 10. No Compound Query Support (AND/OR Nesting)

**Current State**: No schema for combining multiple conditions with AND/OR logic.

**Use Cases IMPOSSIBLE**:
```javascript
// ❌ "Find tasks that are (high priority AND assigned to me) OR (urgent AND unassigned)"
{
  filter: {
    or: [
      {
        and: [
          { property: "Priority", select: { equals: "High" } },
          { property: "Assignee", people: { contains: userId } }
        ]
      },
      {
        and: [
          { property: "Tags", multi_select: { contains: "Urgent" } },
          { property: "Assignee", people: { is_empty: true } }
        ]
      }
    ]
  }
}
```

**Impact**:
- Cannot create complex multi-criteria searches
- Cannot combine date filters with status filters
- Cannot create "either/or" scenarios

---

### 11. Property Types Not Documented

**Location**: `scripts/notion-openapi.json` lines 1933-1936 (create), 1856-1859 (update)

**Current State**:
```json
"properties": {
  "type": "object",
  "description": "Property schema of data source"
  // ❌ No property type definitions!
}
```

**Undocumented Property Types** (18 types):
- `title` - Required title field
- `rich_text` - Text with formatting
- `number` - With format (number, percent, currency, etc.)
- `select` - Single choice with options
- `multi_select` - Multiple choices
- `date` - Date with optional time
- `people` - User references
- `files` - File attachments
- `checkbox` - Boolean
- `url` - Link
- `email` - Email address
- `phone` - Phone number
- `formula` - Calculated value
- `relation` - Reference to another database
- `rollup` - Aggregation from relation
- `created_time` - Auto timestamp
- `created_by` - Auto user reference
- `last_edited_time` - Auto timestamp
- `last_edited_by` - Auto user reference

**Impact**:
- **"Create a database with columns: Name, Status, Priority, Due Date"** - AI doesn't know column types
- **"Find tasks where Status = 'In Progress'"** - AI doesn't know Status is a select type
- **"Add a relation to the Projects database"** - AI doesn't know relation format

---

### 12. Response Schemas Empty (Cannot Interpret Results)

**Location**: ALL data source endpoints return empty schemas

**Current State**:
```json
"200": {
  "description": "Successful response",
  "content": {
    "application/json": {
      "schema": {
        "type": "object"  // ❌ EMPTY - AI cannot parse results!
      }
    }
  }
}
```

**Affected Endpoints**:
- Line 1717: `query-data-source` response
- Line 1781: `retrieve-a-data-source` response
- Line 1871: `update-a-data-source` response
- Line 1955: `create-a-data-source` response
- Line 2034: `list-data-source-templates` response

**Impact**:
- AI doesn't know response contains `results` array
- AI doesn't know pagination structure (`next_cursor`, `has_more`)
- AI cannot extract property values correctly
- AI cannot chain API calls effectively

**Expected Schema**:
```json
"QueryDataSourceResponse": {
  "type": "object",
  "properties": {
    "object": { "type": "string", "const": "list" },
    "results": {
      "type": "array",
      "items": { "$ref": "#/components/schemas/Page" }
    },
    "next_cursor": { "type": "string" },
    "has_more": { "type": "boolean" }
  }
}
```

---

## 🟡 DATABASE MAJOR ISSUES

### 13. No Bulk Create Pages

**Current State**: Each page creation requires a separate API call.

**Impact**:
```javascript
// ❌ "Import 50 contacts from CSV"
// Requires 50 API calls!
for (const contact of csvData) {
  await createPage({ parent: { database_id }, properties: contact })
  // 50 calls = ~10 seconds, risk of timeout
}
```

**Use Cases IMPOSSIBLE**:
- Bulk import from CSV/JSON
- Create multiple tasks from template
- Batch data migration
- Seeding databases with test data

**Fix Required**: Add endpoint `POST /v1/data_sources/{data_source_id}/pages/bulk`

---

### 14. No "Create Page from Template"

**Current State**: `list-data-source-templates` exists (line 1991) but:
- No `create-from-template` endpoint
- Template structure not documented in response
- No way to know what templates contain

**Impact**:
```javascript
// ❌ "Create 10 'Bug Report' pages from template"
// ❌ "Generate weekly meeting notes from template"
// ❌ "Create project kickoff from template"
```

**Templates are unusable by AI** because:
1. Can list templates but cannot see their content
2. Cannot create pages from templates
3. Cannot customize template values during creation

**Fix Required**: Add endpoint `POST /v1/data_sources/{data_source_id}/templates/{template_id}/create`

---

### 15. No Database Schema Discovery

**Current State**: `retrieve-a-data-source` returns empty schema.

**Impact**:
```javascript
// ❌ "What columns does this database have?"
// AI cannot discover:
// - Property names
// - Property types
// - Select options
// - Relation targets
// - Formula return types
```

**Use Cases IMPOSSIBLE**:
- "Create a task with Status = 'In Progress'" - AI doesn't know if Status is select/text
- "Find by Priority = 'High'" - AI doesn't know Priority exists or its type
- "Add relation to Project X" - AI doesn't know relation format

**Fix Required**: Ensure `retrieve-a-data-source` returns complete property schema:
```json
"properties": {
  "type": "object",
  "additionalProperties": {
    "oneOf": [
      { "$ref": "#/components/schemas/titleProperty" },
      { "$ref": "#/components/schemas/selectProperty" },
      { "$ref": "#/components/schemas/relationProperty" },
      // ... all 18 types
    ]
  }
}
```

---

### 16. No Smart Query Helper

**Current State**: AI must construct raw Notion API filters manually.

**Impact**:
- High cognitive load for AI
- Error-prone filter construction
- No natural language to filter conversion

**Fix Required**: Add helper endpoint `POST /v1/data_sources/{data_source_id}/smart-query`:
```json
{
  "natural_language": "high priority tasks assigned to me due this week",
  "auto_convert": true
}
```

---

## Summary Table

### General Use Cases

| Use Case | Status | Primary Blocker |
|----------|--------|-----------------|
| 1. Create structured page | **IMPOSSIBLE** | Only 2 block types (Issue #1) |
| 2. Search content | **SEVERELY LIMITED** | Title-only search (Issue #2) |
| 3. Update multiple resources | **IMPOSSIBLE** | No batch operations (Issue #3) |
| 4. List/traverse database | **INEFFICIENT** | Manual pagination (Issue #4) |
| 5. Create from template | **IMPOSSIBLE** | Block types limited (Issue #1) |

### Database Use Cases

| Use Case | Status | Primary Blocker |
|----------|--------|-----------------|
| 6. Query with filters | **IMPOSSIBLE** | Filter schema undefined (Issue #9) |
| 7. Complex queries (AND/OR) | **IMPOSSIBLE** | No compound filter support (Issue #10) |
| 8. Create page in database | **VERY DIFFICULT** | Property types undocumented (Issue #11) |
| 9. Interpret query results | **IMPOSSIBLE** | Empty response schemas (Issue #12) |
| 10. Bulk import data | **IMPOSSIBLE** | No bulk create (Issue #13) |
| 11. Create from template | **IMPOSSIBLE** | No create-from-template (Issue #14) |
| 12. Discover database schema | **IMPOSSIBLE** | Empty schema response (Issue #15) |

---

## Root Cause

The Notion MCP Server is designed as a "transparent proxy" that auto-generates MCP tools from the OpenAPI specification. While elegant, this approach has a critical flaw:

**If the OpenAPI spec is incomplete, the generated tools are also incomplete.**

The current `scripts/notion-openapi.json` file is missing:
- 29 out of 31 block type definitions
- **Complete filter schema for queries (13 property types × ~5 operators each)**
- **Compound filter structure (AND/OR nesting)**
- **All 18 property type schemas**
- **Response schemas for most endpoints**
- Webhook endpoint definitions

---

## Recommended Fix Priority

### Priority 1 (CRITICAL - Blocks ALL database use cases)
1. **Define complete filter schema** for `query-data-source` with:
   - CompoundFilter (and/or)
   - All 13 property type filters with their operators
   - Proper nesting structure
2. **Define all 18 property type schemas** in `components/schemas`
3. **Fix all empty response schemas** (query-data-source, retrieve-a-data-source, etc.)

### Priority 2 (CRITICAL - Blocks page/content use cases)
4. **Add all 29 missing block type schemas** to `scripts/notion-openapi.json`
5. **Fix `post-page.children` schema** to use `blockObjectRequest`

### Priority 3 (MAJOR - Database efficiency)
6. **Add bulk create endpoint** (`POST /v1/data_sources/{id}/pages/bulk`)
7. **Add create-from-template endpoint** (`POST /v1/data_sources/{id}/templates/{id}/create`)
8. **Add pagination helper methods** (e.g., `queryDataSourceAll`, `getBlockChildrenAll`)

### Priority 4 (ENHANCEMENT - Nice to have)
9. **Add webhook support** to the OpenAPI spec
10. **Add smart-query helper** for natural language to filter conversion

---

## Files to Modify

### Primary File
**`scripts/notion-openapi.json`** - Source of truth for all MCP tools

**Add to `components/schemas`:**
- All 29 missing block type schemas
- CompoundFilter, PropertyFilter schemas
- All 13 filter type schemas (checkboxFilter, dateFilter, etc.)
- All 18 property type schemas (titleProperty, selectProperty, etc.)
- QueryDataSourceResponse, DataSourceResponse schemas

**Fix in endpoints:**
- `post-page.children` items type → `blockObjectRequest`
- All `200` response schemas → proper structure
- `query-data-source` filter → proper schema

### Secondary Files
- **`src/openapi-mcp-server/openapi/parser.ts`** - May need updates for pagination helpers
- **`src/openapi-mcp-server/mcp/proxy.ts`** - May need updates for helper methods

No code changes are required in other files - tools are auto-generated from the spec!
