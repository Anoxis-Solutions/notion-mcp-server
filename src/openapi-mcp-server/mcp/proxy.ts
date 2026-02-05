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
      'create-meeting-notes': {
        name: 'create-meeting-notes',
        description: 'Create a structured meeting notes page in Notion with sections for attendees, agenda, discussion points, and action items',
        arguments: [
          {
            name: 'meeting_title',
            description: 'The title of the meeting',
            required: true
          },
          {
            name: 'attendees',
            description: 'List of meeting attendees (optional)',
            required: false
          },
          {
            name: 'date',
            description: 'Meeting date (optional, defaults to today)',
            required: false
          }
        ],
        getMessages: (args: Record<string, string>) => {
          const { meeting_title, attendees, date } = args
          const today = new Date().toISOString().split('T')[0]
          const meetingDate = date || today

          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Create a meeting notes page in Notion with the following details:

Title: ${meeting_title}
Date: ${meetingDate}
${attendees ? `Attendees: ${attendees}` : ''}

The page should include:
1. A heading for the meeting title
2. Meeting date and attendees (if provided)
3. An "Agenda" section with bullet points for topics to discuss
4. A "Discussion Points" section for notes during the meeting
5. An "Action Items" section with checkboxes for tasks, including:
   - Task description
   - Assigned to (person)
   - Due date
   - Status checkbox

Use appropriate Notion block types like headings, bulleted lists, and to-do lists to make the page well-structured and easy to use during and after the meeting.`
              }
            }
          ]
        }
      },

      'create-task-page': {
        name: 'create-task-page',
        description: 'Create a task tracking page in Notion with a table or board view for managing tasks, priorities, and statuses',
        arguments: [
          {
            name: 'project_name',
            description: 'Name of the project or task list',
            required: true
          },
          {
            name: 'task_description',
            description: 'Brief description of what these tasks are for',
            required: false
          }
        ],
        getMessages: (args: Record<string, string>) => {
          const { project_name, task_description } = args

          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Create a task tracking page in Notion for: ${project_name}
${task_description ? `\nDescription: ${task_description}` : ''}

The page should include:
1. A clear heading with the project name
2. A table view with the following columns:
   - Task Name (title column)
   - Status (select: Not Started, In Progress, Done, Blocked)
   - Priority (select: Low, Medium, High, Urgent)
   - Assignee (person property)
   - Due Date (date property)
   - Tags (multi-select for categorization)
3. Sample tasks to demonstrate the structure
4. Consider adding a board view grouped by Status for easy visual tracking

Make the page clean, organized, and ready for immediate use in task management.`
              }
            }
          ]
        }
      },

      'weekly-report': {
        name: 'weekly-report',
        description: 'Create a weekly report template in Notion for tracking accomplishments, plans, and blockers',
        arguments: [
          {
            name: 'week_start',
            description: 'Start date of the week (e.g., 2024-01-15)',
            required: true
          },
          {
            name: 'team_name',
            description: 'Name of the team or individual (optional)',
            required: false
          }
        ],
        getMessages: (args: Record<string, string>) => {
          const { week_start, team_name } = args

          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Create a weekly report page in Notion for the week starting: ${week_start}
${team_name ? `Team: ${team_name}` : ''}

The page should include:
1. Heading with "Weekly Report - Week of [date]"
2. Section: "Key Accomplishments This Week"
   - Bullet points for completed tasks/milestones
3. Section: "Work in Progress"
   - Bullet points for ongoing work with status
4. Section: "Plans for Next Week"
   - Bullet points for upcoming priorities
5. Section: "Blockers & Challenges"
   - List any issues preventing progress
   - Note what help is needed
6. Section: "Metrics & Highlights"
   - Key numbers or achievements worth highlighting
7. Optional: A simple table or checklist format for tracking specific items

Use headings, dividers, and appropriate spacing to make the report easy to read and update weekly.`
              }
            }
          ]
        }
      },

      'project-roadmap': {
        name: 'project-roadmap',
        description: 'Create a project roadmap page in Notion with timeline view, milestones, and deliverables',
        arguments: [
          {
            name: 'project_name',
            description: 'Name of the project',
            required: true
          },
          {
            name: 'timeline',
            description: 'Project timeline description (e.g., "Q1 2024" or "6 months")',
            required: false
          },
          {
            name: 'objective',
            description: 'Main project objective or goal (optional)',
            required: false
          }
        ],
        getMessages: (args: Record<string, string>) => {
          const { project_name, timeline, objective } = args

          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Create a project roadmap page in Notion for: ${project_name}
${timeline ? `\nTimeline: ${timeline}` : ''}
${objective ? `\nObjective: ${objective}` : ''}

The page should include:
1. Project title and brief description
2. Section: "Project Overview"
   - Goal/Objective
   - Timeline
   - Key stakeholders
3. Section: "Phases & Milestones"
   - Timeline view or table showing:
     - Phase name
     - Start/End dates
     - Key deliverables
     - Status (Not Started, In Progress, Complete)
     - Dependencies
4. Section: "Upcoming Deliverables"
   - List of immediate next items
5. Section: "Risks & Issues"
   - Track potential risks and mitigation plans
6. Optional: A visual timeline using dates and status properties

Use database views (timeline, table, board) to make the roadmap interactive and easy to update.`
              }
            }
          ]
        }
      },

      'knowledge-base-entry': {
        name: 'knowledge-base-entry',
        description: 'Create a knowledge base article page in Notion with proper structure for documentation',
        arguments: [
          {
            name: 'topic',
            description: 'The main topic or title of the knowledge base entry',
            required: true
          },
          {
            name: 'category',
            description: 'Category or tag for the entry (e.g., "Technical", "Process", "Onboarding")',
            required: false
          }
        ],
        getMessages: (args: Record<string, string>) => {
          const { topic, category } = args

          return [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Create a knowledge base article page in Notion for the topic: ${topic}
${category ? `\nCategory: ${category}` : ''}

The page should include:
1. Clear heading with the topic title
2. Section: "Overview"
   - Brief summary of what this entry covers
   - Who this information is for
3. Section: "Key Information"
   - Main content with appropriate subheadings
   - Use bullet points, numbered lists, and code blocks where applicable
4. Section: "Resources & Links"
   - Related internal links
   - External references
   - Helpful files or attachments
5. Section: "FAQ"
   - Common questions and quick answers
6. Section: "Last Updated"
   - Date stamp and author
7. Optional: Tags property for easy categorization and search

Make the page scannable with clear headings, use toggle blocks for detailed content that might clutter the main view, and include proper formatting for readability.`
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
