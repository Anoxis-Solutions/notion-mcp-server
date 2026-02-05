/**
 * Response Transformer for Notion MCP Server
 *
 * Transforms verbose Notion API responses into reduced formats for better LLM context.
 * Handles all Notion property types generically.
 */

export type OutputMode = 'full' | 'reduced' | 'success_only'

/**
 * Configuration for response transformation
 */
export interface TransformConfig {
  mode: OutputMode
  fields?: string[] // Optional field whitelist for reduced mode
  operationType?: 'read' | 'write' // Auto-detected from HTTP method
}

/**
 * ResponseTransformer class
 *
 * Generic transformation system for Notion API responses.
 * Handles all property types and nested structures.
 */
export class ResponseTransformer {
  private defaultMode: OutputMode

  constructor(defaultMode: OutputMode = 'full') {
    this.defaultMode = defaultMode
  }

  /**
   * Transform a response based on the output mode
   */
  transform(data: unknown, config: Partial<TransformConfig> = {}): unknown {
    const mode = config.mode ?? this.defaultMode
    const operationType = config.operationType ?? this.detectOperationType(data)

    if (mode === 'full') {
      return data // Return unchanged
    }

    if (mode === 'success_only') {
      return this.transformSuccessOnly(data, operationType)
    }

    if (mode === 'reduced') {
      return this.transformReduced(data, config.fields)
    }

    return data
  }

  /**
   * Detect operation type from response structure
   */
  private detectOperationType(data: unknown): 'read' | 'write' {
    if (!data || typeof data !== 'object') {
      return 'read'
    }

    const obj = data as Record<string, unknown>

    // Write operations typically return just the created/updated object
    // with id, created_time, last_edited_time
    if ('id' in obj && 'created_time' in obj && 'last_edited_time' in obj) {
      // Check if it's a simple write response (minimal fields)
      const keys = Object.keys(obj)
      if (keys.length <= 10) {
        return 'write'
      }
    }

    return 'read'
  }

  /**
   * Transform to success_only format
   * Returns minimal confirmation for write operations
   */
  private transformSuccessOnly(data: unknown, operationType: 'read' | 'write'): unknown {
    if (!data || typeof data !== 'object') {
      return { success: true }
    }

    const obj = data as Record<string, unknown>

    // For write operations, return key identifiers
    if ('id' in obj) {
      const result: Record<string, unknown> = {
        success: true,
        id: obj.id,
      }

      if ('created_time' in obj) {
        result.created_time = obj.created_time
      }

      if ('last_edited_time' in obj) {
        result.last_edited_time = obj.last_edited_time
      }

      // For array responses (like query results), return count
      if ('results' in obj && Array.isArray(obj.results)) {
        result.count = obj.results.length
        result.message = `Successfully processed ${obj.results.length} item(s)`
      } else {
        result.message = 'Operation successful'
      }

      return result
    }

    // For list/array responses
    if (Array.isArray(data)) {
      return {
        success: true,
        count: data.length,
        message: `Successfully processed ${data.length} item(s)`,
      }
    }

    return { success: true }
  }

  /**
   * Transform to reduced format
   * Extracts values from nested structures while keeping useful metadata
   */
  private transformReduced(data: unknown, fields?: string[]): unknown {
    if (data === null || data === undefined) {
      return data
    }

    if (Array.isArray(data)) {
      return data.map(item => this.transformReduced(item, fields))
    }

    if (typeof data !== 'object') {
      return data
    }

    const obj = data as Record<string, unknown>

    // Handle paginated responses with results array
    if ('results' in obj && Array.isArray(obj.results)) {
      return {
        ...this.extractMetadata(obj),
        results: obj.results.map(item => this.transformObject(item, fields)),
      }
    }

    // Handle single object responses
    return this.transformObject(obj, fields)
  }

  /**
   * Transform a single object
   */
  private transformObject(obj: Record<string, unknown>, fields?: string[]): Record<string, unknown> {
    // If fields whitelist is provided, only include those fields
    if (fields && fields.length > 0) {
      const result: Record<string, unknown> = {}
      for (const field of fields) {
        if (field in obj) {
          result[field] = this.transformValue(obj[field], field)
        }
      }
      return result
    }

    // Otherwise, transform all fields
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(obj)) {
      // Always keep certain metadata fields as-is
      if (this.isMetadataField(key)) {
        result[key] = value
        continue
      }

      // Transform property values
      if (key === 'properties' && typeof value === 'object' && value !== null) {
        result[key] = this.transformProperties(value as Record<string, unknown>)
      } else {
        result[key] = this.transformValue(value, key)
      }
    }

    return result
  }

  /**
   * Check if a field is metadata that should be preserved
   */
  private isMetadataField(key: string): boolean {
    return ['id', 'created_time', 'last_edited_time', 'created_by', 'last_edited_by',
            'archived', 'in_trash', 'url', 'public_url', 'parent', 'object',
            'type', 'has_children', 'next_cursor', 'prev_cursor'].includes(key)
  }

  /**
   * Extract metadata from paginated responses
   */
  private extractMetadata(obj: Record<string, unknown>): Record<string, unknown> {
    const metadata: Record<string, unknown> = {}

    for (const key of ['next_cursor', 'prev_cursor', 'has_more', 'type', 'object']) {
      if (key in obj) {
        metadata[key] = obj[key]
      }
    }

    return metadata
  }

  /**
   * Transform properties object (page/database properties)
   */
  private transformProperties(properties: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const [propName, propValue] of Object.entries(properties)) {
      if (propValue && typeof propValue === 'object') {
        result[propName] = this.extractNotionValue(propValue as Record<string, unknown>)
      } else {
        result[propName] = propValue
      }
    }

    return result
  }

  /**
   * Transform a single value
   */
  private transformValue(value: unknown, key: string): unknown {
    if (value === null || value === undefined) {
      return value
    }

    if (Array.isArray(value)) {
      return value.map(item => {
        if (item && typeof item === 'object') {
          return this.transformObject(item as Record<string, unknown>)
        }
        return item
      })
    }

    if (typeof value === 'object') {
      return this.transformObject(value as Record<string, unknown>)
    }

    return value
  }

  /**
   * Extract value from a Notion property object
   *
   * Handles all Notion property types:
   * - title: rich_text array
   * - rich_text: rich_text array
   * - select: { id, name, color }
   * - multi_select: array of select objects
   * - date: { start, end }
   * - number: number
   * - checkbox: boolean
   * - url: string
   * - email: string
   * - phone: string
   * - files: array of file objects
   * - people: array of user objects
   * - relation: array of ids
   * - formula: evaluated value
   * - rollup: calculated value
   * - status: { id, name, color }
   * - created_time: string
   * - created_by: partial user
   * - last_edited_time: string
   * - last_edited_by: partial user
   * - unique_id: { prefix, number }
   * - place: place data
   */
  extractNotionValue(property: Record<string, unknown>): unknown {
    if (!property || typeof property !== 'object') {
      return property
    }

    const type = property.type as string

    if (!type) {
      return property
    }

    switch (type) {
      case 'title':
      case 'rich_text':
        // Extract text content from rich_text array
        if (Array.isArray(property[type])) {
          const texts = property[type] as Array<Record<string, unknown>>
          const content = texts
            .map(t => {
              if (t.type === 'text' && t.text && typeof t.text === 'object') {
                return (t.text as Record<string, unknown>).content
              }
              return null
            })
            .filter(Boolean)
            .join('')

          // Return content, but keep link if present
          if (texts.length > 0) {
            const first = texts[0]
            if (first.text && typeof first.text === 'object') {
              const link = (first.text as Record<string, unknown>).link
              if (link && typeof link === 'object') {
                return { content, url: (link as Record<string, unknown>).url }
              }
            }
          }

          return content
        }
        return property[type]

      case 'select':
        // Return just the name (most useful value)
        if (property.select && typeof property.select === 'object') {
          return (property.select as Record<string, unknown>).name
        }
        return null

      case 'multi_select':
        // Return array of names
        if (Array.isArray(property.multi_select)) {
          return (property.multi_select as Array<Record<string, unknown>>)
            .map(s => s.name)
            .filter(Boolean)
        }
        return []

      case 'date':
        // Return start date (and end if present)
        if (property.date && typeof property.date === 'object') {
          const date = property.date as Record<string, unknown>
          if (date.end) {
            return { start: date.start, end: date.end }
          }
          return date.start
        }
        return null

      case 'number':
        return property.number

      case 'checkbox':
        return property.checkbox

      case 'url':
        return property.url

      case 'email':
        return property.email

      case 'phone_number':
        return property.phone_number

      case 'files':
        // Extract URLs from file objects
        if (Array.isArray(property.files)) {
          return (property.files as Array<Record<string, unknown>>).map(file => {
            if (file.type === 'external' && file.external) {
              return { url: (file.external as Record<string, unknown>).url }
            }
            if (file.type === 'file' && file.file) {
              return {
                url: (file.file as Record<string, unknown>).url,
                expiry_time: (file.file as Record<string, unknown>).expiry_time,
              }
            }
            return null
          }).filter(Boolean)
        }
        return []

      case 'people':
        // Extract user names/ids from people array
        if (Array.isArray(property.people)) {
          return (property.people as Array<Record<string, unknown>>).map(person => {
            return {
              id: person.id,
              name: person.name,
            }
          })
        }
        return []

      case 'relation':
        // Return array of related IDs
        if (Array.isArray(property.relation)) {
          return property.relation
        }
        return []

      case 'formula':
        // Return the evaluated result
        if (property.formula && typeof property.formula === 'object') {
          const formula = property.formula as Record<string, unknown>
          // Return the actual value (string, number, boolean, or date object)
          if ('string' in formula) return formula.string
          if ('number' in formula) return formula.number
          if ('boolean' in formula) return formula.boolean
          if ('date' in formula) return formula.date
        }
        return null

      case 'rollup':
        // Return the calculated value
        if (property.rollup && typeof property.rollup === 'object') {
          const rollup = property.rollup as Record<string, unknown>
          if ('number' in rollup) return rollup.number
          if ('date' in rollup) return rollup.date
          if ('array' in rollup) return rollup.array
          if ('incomplete' in rollup) return null
        }
        return null

      case 'status':
        // Return just the name
        if (property.status && typeof property.status === 'object') {
          return (property.status as Record<string, unknown>).name
        }
        return null

      case 'created_time':
        return property.created_time

      case 'created_by':
        if (property.created_by && typeof property.created_by === 'object') {
          return {
            id: (property.created_by as Record<string, unknown>).id,
            name: (property.created_by as Record<string, unknown>).name,
          }
        }
        return null

      case 'last_edited_time':
        return property.last_edited_time

      case 'last_edited_by':
        if (property.last_edited_by && typeof property.last_edited_by === 'object') {
          return {
            id: (property.last_edited_by as Record<string, unknown>).id,
            name: (property.last_edited_by as Record<string, unknown>).name,
          }
        }
        return null

      case 'unique_id':
        if (property.unique_id && typeof property.unique_id === 'object') {
          const uniqueId = property.unique_id as Record<string, unknown>
          if (uniqueId.number !== undefined) {
            const prefix = uniqueId.prefix as string | null
            const num = uniqueId.number as string | number
            return prefix ? `${prefix}-${num}` : num
          }
        }
        return null

      case 'place':
        if (property.place && typeof property.place === 'object') {
          return property.place
        }
        return null

      default:
        // For unknown types, return as-is
        return property
    }
  }

  /**
   * Get the configured default mode
   */
  getDefaultMode(): OutputMode {
    return this.defaultMode
  }

  /**
   * Set the default mode
   */
  setDefaultMode(mode: OutputMode): void {
    this.defaultMode = mode
  }
}

/**
 * Create a transformer instance from environment variable
 */
export function createTransformerFromEnv(): ResponseTransformer {
  const mode = (process.env.NOTION_MCP_OUTPUT_MODE as OutputMode) || 'full'
  return new ResponseTransformer(mode)
}
