import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, GetPromptRequestSchema, JSONRPCResponse, ListPromptsRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, PromptMessage, ReadResourceRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js'
import { JSONSchema7 as IJsonSchema } from 'json-schema'
import { OpenAPIToMCPConverter } from '../openapi/parser'
import { HttpClient, HttpClientError } from '../client/http-client'
import { OpenAPIV3 } from 'openapi-types'
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { ResponseTransformer, createTransformerFromEnv, TransformConfig } from './transformer'
import {
  MCPNotionError,
  AuthenticationError,
  ValidationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError
} from './errors'
import { formatUserMessage } from './error-formatter'

type PathItemObject = OpenAPIV3.PathItemObject & {
  get?: OpenAPIV3.OperationObject
  put?: OpenAPIV3.OperationObject
  post?: OpenAPIV3.OperationObject
  delete?: OpenAPIV3.OperationObject
  patch?: OpenAPIV3.OperationObject
}

type NewToolDefinition = {
  methods: Array<{
    name: string
    description: string
    inputSchema: IJsonSchema & { type: 'object' }
    returnSchema?: IJsonSchema
  }>
}

type PromptDefinition = {
  name: string
  description: string
  arguments?: Array<{
    name: string
    description: string
    required: boolean
  }>
  getMessages: (args: Record<string, string>) => PromptMessage[]
}

type ResourceDefinition = {
  uri: string
  name: string
  description: string
  mimeType: string
  getContent: () => string
}

/**
 * Recursively deserialize stringified JSON values in parameters.
 * This handles the case where MCP clients (like Cursor, Claude Code) double-serialize
 * nested object parameters, sending them as JSON strings instead of objects.
 *
 * @see https://github.com/makenotion/notion-mcp-server/issues/176
 */
function deserializeParams(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      // Check if the string looks like a JSON object or array
      const trimmed = value.trim()
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          const parsed = JSON.parse(value)
          // Only use parsed value if it's an object or array
          if (typeof parsed === 'object' && parsed !== null) {
            // Recursively deserialize nested objects
            result[key] = Array.isArray(parsed)
              ? parsed
              : deserializeParams(parsed as Record<string, unknown>)
            continue
          }
        } catch {
          // If parsing fails, keep the original string value
        }
      }
    }
    result[key] = value
  }

  return result
}

/**
 * Map HttpClientError to appropriate MCP error class based on HTTP status and error code
 */
export function mapNotionErrorToMCPError(
  error: HttpClientError,
  operation?: string,
  params?: Record<string, unknown>
): MCPNotionError {
  const { status, data, message: originalMessage } = error

  // Extract error message from Notion API response
  // The HttpClientError message is in format "STATUS StatusText" (e.g., "404 Not Found")
  // We want to extract the actual message from the data if available
  let message = originalMessage.replace(/^\d+\s*/, '') // Remove leading status code
  let errorCode: string | undefined
  let field: string | undefined
  let resourceType: string | undefined
  let retryAfter: number | undefined

  if (typeof data === 'object' && data !== null) {
    const errorData = data as any
    // Notion API error response structure
    if (errorData.message) {
      message = errorData.message
    }
    if (errorData.code) {
      errorCode = errorData.code
    }
    if (errorData.field) {
      field = errorData.field
    }
    // Extract Retry-After header from error data if present
    if (errorData.retry_after !== undefined) {
      retryAfter = typeof errorData.retry_after === 'number' ? errorData.retry_after : parseInt(errorData.retry_after, 10)
    }
  }

  // Map based on HTTP status code
  switch (status) {
    case 400:
      return new ValidationError(message, field, operation, params)

    case 401:
      return new AuthenticationError(message, operation, params, 401)

    case 403: // Notion uses 403 for some auth issues too
      if (errorCode === 'permission_required') {
        return new PermissionError(message, operation, params)
      }
      // 403 without permission_required is treated as authentication error
      return new AuthenticationError(message, operation, params, 403)

    case 404:
      // Try to infer resource type from operation
      if (operation) {
        // Check for block first (before page, since page includes 'block' in some compound names)
        if (operation.includes('block')) {
          resourceType = 'block'
        } else if (operation.includes('page')) {
          resourceType = 'page'
        } else if (operation.includes('data_source') || operation.includes('data-source')) {
          resourceType = 'database'
        } else if (operation.includes('database')) {
          resourceType = 'database'
        } else if (operation.includes('user')) {
          resourceType = 'user'
        }
      }
      return new NotFoundError(message, resourceType, operation, params)

    case 409:
      return new ConflictError(message, operation, params)

    case 429:
      // Check for Retry-After in headers
      if (error.headers) {
        const retryAfterHeader = error.headers.get('Retry-After')
        if (retryAfterHeader) {
          const parsed = parseInt(retryAfterHeader, 10)
          if (!isNaN(parsed)) {
            retryAfter = parsed
          }
        }
      }
      return new RateLimitError(message, retryAfter, operation, params)

    case 500:
    case 502:
    case 503:
    case 504:
      return new ServerError(message, operation, params)

    default:
      // Fallback to generic server error for unknown statuses
      return new ServerError(message, operation, params)
  }
}

// import this class, extend and return server
export class MCPProxy {
  private server: Server
  private httpClient: HttpClient
  private tools: Record<string, NewToolDefinition>
  private openApiLookup: Record<string, OpenAPIV3.OperationObject & { method: string; path: string }>
  private transformer: ResponseTransformer
  private prompts: Record<string, PromptDefinition>
  private openApiSpec: OpenAPIV3.Document
  private resources: Record<string, ResourceDefinition>

  constructor(name: string, openApiSpec: OpenAPIV3.Document) {
    this.server = new Server({ name, version: '1.0.0' }, { capabilities: { tools: {}, prompts: {}, resources: {} } })
    this.openApiSpec = openApiSpec
    const baseUrl = openApiSpec.servers?.[0].url
    if (!baseUrl) {
      throw new Error('No base URL found in OpenAPI spec')
    }
    this.httpClient = new HttpClient(
      {
        baseUrl,
        headers: this.parseHeadersFromEnv(),
      },
      openApiSpec,
    )

    // Initialize response transformer with environment-based configuration
    this.transformer = createTransformerFromEnv()

    // Convert OpenAPI spec to MCP tools
    const converter = new OpenAPIToMCPConverter(openApiSpec)
    const { tools, openApiLookup } = converter.convertToMCPTools()
    this.tools = tools
    this.openApiLookup = openApiLookup

    // Initialize prompts catalog
    this.prompts = this.initializePrompts()

    // Initialize resources
    this.resources = this.initializeResources()

    this.setupHandlers()
  }

  private setupHandlers() {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = []

      // Add methods as separate tools to match the MCP format
      Object.entries(this.tools).forEach(([toolName, def]) => {
        def.methods.forEach(method => {
          const toolNameWithMethod = `${toolName}-${method.name}`;
          const truncatedToolName = this.truncateToolName(toolNameWithMethod);

          // Look up the HTTP method to determine annotations
          const operation = this.openApiLookup[toolNameWithMethod];
          const httpMethod = operation?.method?.toLowerCase();
          const isReadOnly = httpMethod === 'get';

          tools.push({
            name: truncatedToolName,
            description: method.description,
            inputSchema: method.inputSchema as Tool['inputSchema'],
            annotations: {
              title: this.operationIdToTitle(method.name),
              ...(isReadOnly
                ? { readOnlyHint: true }
                : { destructiveHint: true }),
            },
          })
        })
      })

      return { tools }
    })

    // Handle tool calling
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: params } = request.params

      // Find the operation in OpenAPI spec
      const operation = this.findOperation(name)
      if (!operation) {
        throw new Error(`Method ${name} not found`)
      }

      // Deserialize any stringified JSON parameters (fixes double-serialization bug)
      // See: https://github.com/makenotion/notion-mcp-server/issues/176
      const deserializedParams = params ? deserializeParams(params as Record<string, unknown>) : {}

      // Extract transformation parameters (remove them from params passed to API)
      const { _output, _fields, ...apiParams } = deserializedParams as Record<string, unknown>

      try {
        // Execute the operation
        const response = await this.httpClient.executeOperation(operation, apiParams)

        // Apply response transformation based on _output parameter
        const transformConfig: Partial<TransformConfig> = {
          mode: (_output as TransformConfig['mode']) || undefined,
          fields: _fields as string[] | undefined,
          operationType: ['get', 'head'].includes(operation.method?.toLowerCase() ?? '')
            ? 'read'
            : 'write',
        }

        const transformedData = this.transformer.transform(response.data, transformConfig)

        // Convert response to MCP format
        return {
          content: [
            {
              type: 'text', // currently this is the only type that seems to be used by mcp server
              text: JSON.stringify(transformedData),
            },
          ],
        }
      } catch (error) {
        console.error('Error in tool call', error)
        if (error instanceof HttpClientError) {
          console.error('HttpClientError encountered, returning structured error', error)
          // Map to appropriate MCP error
          const mcpError = mapNotionErrorToMCPError(
            error,
            operation.operationId ?? undefined,
            Object.keys(apiParams).length > 0 ? apiParams : undefined
          )

          // Format user-friendly message
          const userMessage = formatUserMessage(mcpError)

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  message: userMessage,
                  error: mcpError.toJSON()
                })
              }
            ],
            isError: true
          }
        }
        throw error
      }
    })

    // Handle prompt listing
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: Object.entries(this.prompts).map(([name, def]) => ({
          name,
          description: def.description,
          arguments: def.arguments?.map(arg => ({
            name: arg.name,
            description: arg.description,
            required: arg.required
          }))
        }))
      }
    })

    // Handle prompt getting
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params
      const prompt = this.prompts[name]

      if (!prompt) {
        throw new Error(`Prompt ${name} not found`)
      }

      // Validate required arguments
      if (prompt.arguments) {
        for (const arg of prompt.arguments) {
          if (arg.required && !args?.[arg.name]) {
            throw new Error(`Missing required argument: ${arg.name}`)
          }
        }
      }

      const messages = prompt.getMessages(args || {})

      return { messages }
    })

    // Handle resource listing
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: Object.entries(this.resources).map(([uri, def]) => ({
          uri,
          name: def.name,
          description: def.description,
          mimeType: def.mimeType
        }))
      }
    })

    // Handle resource reading
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params
      const resource = this.resources[uri]

      if (!resource) {
        throw new Error(`Resource ${uri} not found`)
      }

      return {
        contents: [{
          uri,
          mimeType: resource.mimeType,
          text: resource.getContent()
        }]
      }
    })
  }

  private initializePrompts(): Record<string, PromptDefinition> {
    return {
      'query-guide': {
        name: 'query-guide',
        description: 'Guide for querying Notion databases with filters, sorting, and compound conditions. Read this before querying data sources.',
        arguments: [],
        getMessages: () => {
          // Get filter schemas from resource for dynamic content
          const filterResource = this.resources['notion://filter-schemas']
          const filterContent = filterResource ? JSON.parse(filterResource.getContent()) : { filterSchemas: {} }

          const examples = Object.entries(filterContent.filterSchemas || {}).slice(0, 3).map(([type, ops]) => {
            const opsList = Array.isArray(ops) ? (ops as string[]).slice(0, 3).join(', ') : ''
            return `      - ${type}: ${opsList}...`
          }).join('\n')

          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `# Notion Database Query Guide

When querying Notion databases with \`query-data-source\`, use these patterns:

## Tool to Use
- \`query-data-source\` - Query a database/data source with filters and sorting

## Filter Structure
Pass filter as JSON string in the \`filter\` parameter:

### Simple Filter (single condition)
\`filter={"property":"Status","select":{"equals":"Done"}}\`

### Date Filter Examples
\`filter={"property":"Due Date","date":{"on_or_after":"2025-01-01"}}\`
\`filter={"property":"Created","date":{"past_week":{}}}\`

### Compound Filter (AND/OR)
\`filter={"and":[
  {"property":"Status","select":{"equals":"In Progress"}},
  {"property":"Priority","select":{"equals":"High"}}
]}\`

## Available Filter Operators by Property Type
${examples || `      - date: equals, before, after, on_or_after, past_week, past_month...
      - select: equals, does_not_equal, is_empty, is_not_empty...
      - number: equals, does_not_equal, greater_than, less_than...`}

For complete operator reference, read the \`notion://filter-schemas\` resource.

## Sorting
\`sorts=[{"property":"Last Edited","direction":"descending"}]\`

## Pagination
Notion uses cursor-based pagination:
- First call: no cursor needed
- Next calls: pass \`start_cursor\` from previous response
- Check \`has_more\` to know if more results exist

## Common Mistakes to Avoid
1. Property names are case-sensitive - match exact database schema
2. Date values must be ISO format: YYYY-MM-DD
3. Compound filters require "and" or "or" as root key
4. Filter parameter is a JSON string, not a direct object

Need more details? Consult the MCP resources:
- \`notion://filter-schemas\` - All operators by property type
- \`notion://property-types\` - Property type configurations
- \`notion://openapi-spec\` - Full API specification`
              }
            }
          ]
        }
      },

      'block-creation-guide': {
        name: 'block-creation-guide',
        description: 'Guide for creating content in Notion pages using different block types. Read this before creating or appending blocks.',
        arguments: [],
        getMessages: () => {
          // Get block types from resource for dynamic content
          const blockResource = this.resources['notion://block-types']
          let blockTypesList = ''
          if (blockResource) {
            const blockContent = JSON.parse(blockResource.getContent())
            blockTypesList = (blockContent.blockTypes || []).slice(0, 15).join(', ')
          }

          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `# Notion Block Creation Guide

When creating content in Notion pages, use these tools and patterns:

## Tools for Block Creation
- \`append-block-children\` - Add blocks to an existing page
- \`create-a-page\` - Create a new page (returns page ID for appending blocks)

## Common Block Types

### Text Blocks
- \`paragraph\` - Regular text (default)
- \`heading_1\`, \`heading_2\`, \`heading_3\` - Headings
- \`code\` - Code blocks with language
- \`callout\` - Highlighted callout boxes
- \`quote\` - Quote blocks

### List Blocks
- \`bulleted_list_item\` - Bullet points
- \`numbered_list_item\` - Numbered lists
- \`to_do\` - Task items with checkbox

### Media Blocks
- \`image\` - Images (external URL)
- \`video\` - Videos (external URL)
- \`file\` - File attachments

### Structure Blocks
- \`divider\` - Horizontal line
- \`toggle\` - Collapsible content
- \`table_of_contents\` - Auto-generated TOC

## Request Format
Pass blocks as an array of block objects. The server automatically handles both formats:

**Option 1 (recommended)**: Pass as native objects
\`children=[{"type":"paragraph","paragraph":{"text":[{"content":"Hello"}]}}]\`

**Option 2**: Pass as JSON string (auto-handled for clients that double-serialize)
\`children="[{\"type\":\"paragraph\",\"paragraph\":{\"text\":[{\"content\":\"Hello\"}]}}]"\`

Note: The server automatically detects and deserializes JSON strings to objects.

## Example: Create a Simple Page
1. Call \`create-a-page\` with title
2. Take returned \`id\`
3. Call \`append-block-children\` with that \`id\` and block content

## Example Block Structures

### Paragraph with text
\`{"type":"paragraph","paragraph":{"text":[{"content":"Hello world"}]}}\`

### Heading
\`{"type":"heading_1","heading_1":{"text":[{"content":"Title"}]}}\`

### To-do item
\`{"type":"to_do","to_do":{"text":[{"content":"Task"}],"checked":false}}\`

### Code block
\`{"type":"code","code":{"text":["console.log('hello')"],"language":"javascript"}}\`

## Common Mistakes to Avoid
1. Always use full block structure with \`object: "block"\`
2. Text content goes in \`text[]\` array with \`content\` field
3. The \`children\` parameter accepts both native objects and JSON strings (auto-detected)
4. Block types use underscores (e.g., \`heading_1\`, not \`heading1\`)

Available block types: ${blockTypesList || 'heading_1, heading_2, heading_3, paragraph, code, quote, callout, bulleted_list_item, numbered_list_item, to_do, toggle, divider, image, video...'}

For complete block type reference, read the \`notion://block-types\` resource.`
              }
            }
          ]
        }
      },

      'error-handling-guide': {
        name: 'error-handling-guide',
        description: 'Guide for understanding and handling Notion API errors. Read this when you encounter errors.',
        arguments: [],
        getMessages: () => {
          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `# Notion Error Handling Guide

When working with the Notion API, you may encounter errors. Here's how to handle them:

## Error Response Format
All errors return a structured response:
\`{"message":"User-friendly description","error":{"code":"error_code","httpStatus":404,...}}\`

## Common Error Categories

### 401 Unauthorized
- **Code**: \`unauthorized\`
- **Cause**: Invalid or missing bearer token
- **Solution**: Check NOTION_TOKEN starts with "ntn_" and is valid

### 403 Forbidden
- **Code**: \`forbidden\` or \`permission_required\`
- **Cause**: Integration doesn't have access to the resource
- **Solution**: Share the specific page/database with your integration in Notion

### 404 Not Found
- **Code**: \`object_not_found\`
- **Cause**: Resource ID doesn't exist or isn't shared
- **Solution**: Verify the ID and that it's shared with your integration
- **Tip**: The error message indicates the resource type (page, block, database, user)

### 400 Validation Error
- **Code**: \`validation_error\`
- **Cause**: Invalid request body or parameters
- **Solution**: Check parameter names, types, and required fields

### 409 Conflict
- **Code**: \`conflict\`
- **Cause**: Simultaneous modifications
- **Solution**: Retry the request after a short delay

### 429 Rate Limited
- **Code**: \`rate_limited\`
- **Cause**: Too many requests
- **Solution**: Implement exponential backoff, slow down request rate
- **Note**: Check for \`retry_after\` field for wait duration

### 500+ Server Errors
- **Codes**: \`internal_server_error\`, \`bad_gateway\`, etc.
- **Cause**: Notion server issues
- **Solution**: Retry after a short delay

## Error Messages from This MCP Server
The server provides user-friendly error messages:
- Describes what went wrong
- Suggests how to fix it
- Includes the original error code for reference

## Debugging Tips
1. Check the \`message\` field first for user-friendly explanation
2. Look at \`error.code\` for the Notion API error code
3. For 404 errors, verify resource type (page vs database vs block)
4. For 403 errors, ensure sharing in Notion UI
5. For 400 errors, validate parameter names match schema

For complete error code reference, read the \`notion://error-codes\` resource.`
              }
            }
          ]
        }
      },

      'property-types-guide': {
        name: 'property-types-guide',
        description: 'Guide for understanding Notion database property types and their configuration. Read this before creating or querying databases.',
        arguments: [],
        getMessages: () => {
          // Get property types from resource for dynamic content
          const propResource = this.resources['notion://property-types']
          let propTypesList: string[] = []
          if (propResource) {
            const propContent = JSON.parse(propResource.getContent())
            propTypesList = propContent.propertyTypes || []
          }

          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `# Notion Property Types Guide

Understanding property types is essential for creating databases and filtering queries.

## Tools for Property Configuration
- \`create-a-data-source\` - Create a new database with property schema
- \`update-a-data-source\` - Modify existing database properties
- \`query-data-source\` - Filter by property values

## Common Property Types

### Basic Types
- \`title\` - Required title property (every database has one)
- \`text\` / \`rich_text\` - Multi-line text content
- \`number\` - Numeric values with optional formatting
- \`checkbox\` - Boolean true/false
- \`date\` - Date with optional time

### Selection Types
- \`select\` - Single choice from predefined options
- \`multi_select\` - Multiple choices from predefined options

### Relationship Types
- \`people\` - Reference to Notion users
- \`relation\` - Reference to another database

### Content Types
- \`files\` - File attachments
- \`url\` - Link to external resource
- \`email\` - Email address
- \`phone\` - Phone number

### Advanced Types
- \`formula\` - Computed expression
- \`rollup\` - Aggregation from relation
- \`created_time\` - Auto-generated timestamp
- \`created_by\` - Auto-generated user reference
- \`last_edited_time\` - Auto-modified timestamp
- \`last_edited_by\` - Auto-modified user reference

## Property Configuration in Create/Update

When creating a database, properties are defined in the schema:
\`properties:{"Status":{"select":{"options":[{"name":"Done","color":"green"}]}}}\`

## Filtering by Property Type

Different property types use different filter operators:
- **select**: \`equals\`, \`does_not_equal\`, \`is_empty\`
- **date**: \`equals\`, \`before\`, \`after\`, \`on_or_after\`, \`past_week\`
- **number**: \`equals\`, \`greater_than\`, \`less_than\`
- **checkbox**: \`equals\` (true/false)
- **people**: \`contains\`, \`does_not_contain\`

Available property types in this API: ${(propTypesList || ['title', 'text', 'number', 'select', 'multi_select', 'date', 'people', 'checkbox', 'files', 'url', 'email', 'phone', 'formula', 'relation', 'rollup']).slice(0, 15).join(', ')}

## Common Mistakes
1. Title property is mandatory in every database
2. Select options require both \`name\` and \`color\`
3. Filter operators are type-specific (check filter-schemas)
4. Property names are case-sensitive in queries
5. Formula/rollup values are read-only (cannot set in create/update)

For complete property type reference, read the \`notion://property-types\` resource.`
              }
            }
          ]
        }
      },

      'pagination-guide': {
        name: 'pagination-guide',
        description: 'Guide for handling paginated responses from Notion API. Read this when querying large datasets.',
        arguments: [],
        getMessages: () => {
          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `# Notion Pagination Guide

Notion uses cursor-based pagination for large result sets. This guide explains how to handle it.

## Which Tools Return Paginated Results
- \`query-data-source\` - Database queries
- \`search\` - Search across workspace
- \`list-block-children\` - List blocks in a page
- \`retrieve-a-page\` - With children populated

## Pagination Response Structure
Every paginated response includes:
\`{
  "results": [...],
  "next_cursor": "eyJmaWxkZXIiOnsiY...",
  "has_more": true
}\`

## Pagination Flow

### First Request
Call the tool without \`start_cursor\`:
\`query-data-source?data_source_id=xxx\`

### Check for More Results
If \`has_more: true\`, there are more results

### Get Next Page
Pass \`next_cursor\` as \`start_cursor\`:
\`query-data-source?data_source_id=xxx&start_cursor=eyJmaWxkZXIiOnsiY...\`\`

### Stop When
\`has_more: false\` or \`next_cursor\` is null

## Complete Example Pattern
\`\`\`javascript
// First call
response1 = await query-data-source(data_source_id)
all_results = response1.results

// Loop while more results exist
while (response1.has_more) {
  next_response = await query-data-source(
    data_source_id,
    start_cursor=response1.next_cursor
  )
  all_results.push(...next_response.results)
  response1 = next_response
}
\`\`\`

## Important Notes

### Page Size
- Default page size varies by endpoint
- Use page_size parameter to control (max usually 100)
- Larger page sizes = fewer API calls, but more per-request latency

### Cursor Validity
- Cursors expire after some time (minutes)
- Don't store cursors for later use
- Always start fresh for new queries

### Result Ordering
- Results maintain order across pages
- Sorting affects entire result set, not just current page
- Use \`sorts\` parameter for consistent ordering

### Performance
- Prefer filtering to reduce result set size
- Only fetch needed properties with \`_fields\` parameter
- Consider if you really need ALL results

## Common Mistakes
1. Forgetting to check \`has_more\` before looping
2. Using expired cursors from previous sessions
3. Assuming fixed page size across endpoints
4. Not handling empty result sets (has_more=false, results=[])
5. Infinite loops when cursor logic is wrong

## Parameters That Help
- \`page_size\` - Control results per page (1-100 typically)
- \`start_cursor\` - Cursor for next page
- \`_fields\` - Filter response properties (Notion MCP extension)
- \`filter\` - Reduce result set before pagination

## Tools That Don't Paginate
- \`retrieve-a-block\` - Single block
- \`retrieve-a-page\` (without children) - Single page metadata
- \`create-a-page\`, \`update-a-page\` - Single object operations

For complete API details, read the \`notion://openapi-spec\` resource.`
              }
            }
          ]
        }
      }
    }
  }

  private initializeResources(): Record<string, ResourceDefinition> {
    return {
      'notion://property-types': {
        uri: 'notion://property-types',
        name: 'Notion Property Types',
        description: 'Complete reference of all Notion data source property types with their configurations',
        mimeType: 'application/json',
        getContent: () => {
          const dataSourceProp = this.openApiSpec.components?.schemas?.dataSourceProperty as OpenAPIV3.SchemaObject
          if (!dataSourceProp || !dataSourceProp.properties) {
            return JSON.stringify({ error: 'dataSourceProperty schema not found' }, null, 2)
          }

          const typeProp = dataSourceProp.properties.type as OpenAPIV3.SchemaObject
          const propertyTypes = typeProp.enum as string[]

          const typeDetails: Record<string, any> = {}
          for (const propType of propertyTypes) {
            const typeSchema = dataSourceProp.properties[propType] as OpenAPIV3.SchemaObject
            if (typeSchema) {
              typeDetails[propType] = {
                description: typeSchema.description || '',
                properties: typeSchema.properties || {}
              }
            }
          }

          return JSON.stringify({
            propertyTypes,
            typeDetails
          }, null, 2)
        }
      },

      'notion://block-types': {
        uri: 'notion://block-types',
        name: 'Notion Block Types',
        description: 'All available block types for creating content in Notion pages',
        mimeType: 'application/json',
        getContent: () => {
          const schemas = this.openApiSpec.components?.schemas || {}
          const blockTypes: string[] = []

          for (const [schemaName, schema] of Object.entries(schemas)) {
            if (schemaName.endsWith('BlockRequest')) {
              // Extract block type name from schema name (e.g., "heading1BlockRequest" -> "heading_1")
              const blockType = schemaName
                .replace(/([a-z])([A-Z])/g, '$1_$2')
                .replace('Block_Request', '')
                .toLowerCase()
              blockTypes.push(blockType)
            }
          }

          return JSON.stringify({
            blockTypes: blockTypes.sort(),
            count: blockTypes.length
          }, null, 2)
        }
      },

      'notion://filter-schemas': {
        uri: 'notion://filter-schemas',
        name: 'Notion Filter Operators',
        description: 'Available filter operators and conditions for each property type',
        mimeType: 'application/json',
        getContent: () => {
          const schemas = this.openApiSpec.components?.schemas || {}
          const filterSchemas: Record<string, string[]> = {}

          for (const [schemaName, schema] of Object.entries(schemas)) {
            if (schemaName.endsWith('Filter')) {
              const filterSchema = schema as OpenAPIV3.SchemaObject
              const propertyType = schemaName.replace('Filter', '')
              if (filterSchema.properties) {
                filterSchemas[propertyType] = Object.keys(filterSchema.properties)
              }
            }
          }

          return JSON.stringify({
            filterSchemas,
            description: 'Filter operators available for each property type'
          }, null, 2)
        }
      },

      'notion://error-codes': {
        uri: 'notion://error-codes',
        name: 'Notion Error Codes',
        description: 'Error codes and their meanings from the Notion API',
        mimeType: 'application/json',
        getContent: () => {
          return JSON.stringify({
            authenticationErrors: {
              unauthorized: {
                code: 'unauthorized',
                httpStatus: 401,
                description: 'The bearer token is invalid or missing',
                suggestion: 'Check that your NOTION_TOKEN starts with "ntn_" and is valid'
              },
              forbidden: {
                code: 'forbidden',
                httpStatus: 403,
                description: 'The integration does not have access to this resource',
                suggestion: 'Check that the resource is shared with your integration'
              }
            },
            validationErrors: {
              validation_error: {
                code: 'validation_error',
                httpStatus: 400,
                description: 'The request body or parameters are invalid',
                suggestion: 'Check that all required parameters are provided and correctly formatted'
              }
            },
            resourceErrors: {
              object_not_found: {
                code: 'object_not_found',
                httpStatus: 404,
                description: 'The requested resource does not exist or is not shared with the integration',
                suggestion: 'Verify the resource ID and that it is shared with your integration'
              }
            },
            conflictErrors: {
              conflict: {
                code: 'conflict',
                httpStatus: 409,
                description: 'A conflict occurred due to simultaneous modifications',
                suggestion: 'Retry the request after a short delay'
              }
            },
            rateLimitErrors: {
              rate_limited: {
                code: 'rate_limited',
                httpStatus: 429,
                description: 'The request rate has exceeded the limit',
                suggestion: 'Implement exponential backoff and slow down request rate'
              }
            },
            serverErrors: {
              internal_server_error: {
                code: 'internal_server_error',
                httpStatus: 500,
                description: 'An unexpected error occurred on the Notion server',
                suggestion: 'Retry the request after a short delay'
              }
            }
          }, null, 2)
        }
      },

      'notion://openapi-spec': {
        uri: 'notion://openapi-spec',
        name: 'Notion OpenAPI Specification',
        description: 'Complete OpenAPI 3.1.0 specification for the Notion API',
        mimeType: 'application/json',
        getContent: () => {
          return JSON.stringify(this.openApiSpec, null, 2)
        }
      },

      'notion://api-config': {
        uri: 'notion://api-config',
        name: 'Notion API Configuration',
        description: 'API metadata, version information, and server configuration',
        mimeType: 'application/json',
        getContent: () => {
          const info = this.openApiSpec.info
          const servers = this.openApiSpec.servers

          return JSON.stringify({
            title: info?.title,
            version: info?.version,
            description: info?.description,
            license: info?.license,
            servers: servers?.map(server => ({
              url: server.url,
              description: server.description
            })),
            apiVersion: '2025-09-03', // Data Source Edition
            docsUrl: 'https://developers.notion.com/reference/intro'
          }, null, 2)
        }
      }
    }
  }

  private findOperation(operationId: string): (OpenAPIV3.OperationObject & { method: string; path: string }) | null {
    return this.openApiLookup[operationId] ?? null
  }

  private parseHeadersFromEnv(): Record<string, string> {
    // First try OPENAPI_MCP_HEADERS (existing behavior)
    const headersJson = process.env.OPENAPI_MCP_HEADERS
    if (headersJson) {
      try {
        const headers = JSON.parse(headersJson)
        if (typeof headers !== 'object' || headers === null) {
          console.warn('OPENAPI_MCP_HEADERS environment variable must be a JSON object, got:', typeof headers)
        } else if (Object.keys(headers).length > 0) {
          // Only use OPENAPI_MCP_HEADERS if it contains actual headers
          return headers
        }
        // If OPENAPI_MCP_HEADERS is empty object, fall through to try NOTION_TOKEN
      } catch (error) {
        console.warn('Failed to parse OPENAPI_MCP_HEADERS environment variable:', error)
        // Fall through to try NOTION_TOKEN
      }
    }

    // Alternative: try NOTION_TOKEN
    const notionToken = process.env.NOTION_TOKEN
    if (notionToken) {
      return {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2025-09-03'
      }
    }

    return {}
  }

  private getContentType(headers: Headers): 'text' | 'image' | 'binary' {
    const contentType = headers.get('content-type')
    if (!contentType) return 'binary'

    if (contentType.includes('text') || contentType.includes('json')) {
      return 'text'
    } else if (contentType.includes('image')) {
      return 'image'
    }
    return 'binary'
  }

  private truncateToolName(name: string): string {
    if (name.length <= 64) {
      return name;
    }
    return name.slice(0, 64);
  }

  /**
   * Convert an operationId like "createDatabase" to a human-readable title like "Create Database"
   */
  private operationIdToTitle(operationId: string): string {
    // Split on camelCase boundaries and capitalize each word
    return operationId
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[\s_-]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  async connect(transport: Transport) {
    // The SDK will handle stdio communication
    await this.server.connect(transport)
  }

  getServer() {
    return this.server
  }
}
