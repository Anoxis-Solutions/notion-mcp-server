import { describe, it, expect } from 'vitest'
import { Headers } from '../../client/polyfill-headers'
import { HttpClientError } from '../../client/http-client'
import {
  MCPNotionError,
  AuthenticationError,
  ValidationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError
} from '../errors'
import { mapNotionErrorToMCPError } from '../proxy'

describe('Error Classes', () => {
  describe('MCPNotionError', () => {
    it('should create base error with all properties', () => {
      const error = new MCPNotionError(
        'TestError',
        'test_code',
        418,
        'Test error message',
        true,
        'Test suggestion',
        'testOperation',
        { param1: 'value1' }
      )

      expect(error.type).toBe('TestError')
      expect(error.code).toBe('test_code')
      expect(error.httpStatus).toBe(418)
      expect(error.message).toBe('Test error message')
      expect(error.retryable).toBe(true)
      expect(error.suggestion).toBe('Test suggestion')
      expect(error.operation).toBe('testOperation')
      expect(error.params).toEqual({ param1: 'value1' })
    })

    it('should convert to JSON correctly', () => {
      const error = new MCPNotionError(
        'TestError',
        'test_code',
        418,
        'Test error message',
        true,
        'Test suggestion',
        'testOperation',
        { param1: 'value1' }
      )

      const json = error.toJSON()

      expect(json).toEqual({
        type: 'TestError',
        code: 'test_code',
        httpStatus: 418,
        message: 'Test error message',
        retryable: true,
        suggestion: 'Test suggestion',
        operation: 'testOperation',
        params: { param1: 'value1' }
      })
    })

    it('should exclude operation and params from JSON when not provided', () => {
      const error = new MCPNotionError(
        'TestError',
        'test_code',
        418,
        'Test error message',
        false
      )

      const json = error.toJSON()

      expect(json).not.toHaveProperty('operation')
      expect(json).not.toHaveProperty('params')
    })
  })

  describe('AuthenticationError', () => {
    it('should create authentication error with defaults', () => {
      const error = new AuthenticationError('Invalid token')

      expect(error).toBeInstanceOf(MCPNotionError)
      expect(error.type).toBe('AuthenticationError')
      expect(error.code).toBe('unauthorized')
      expect(error.httpStatus).toBe(401)
      expect(error.message).toBe('Invalid token')
      expect(error.retryable).toBe(false)
      expect(error.suggestion).toContain('ntn_')
    })

    it('should include operation and params when provided', () => {
      const error = new AuthenticationError(
        'Invalid token',
        'retrieve-a-block',
        { block_id: '123' }
      )

      expect(error.operation).toBe('retrieve-a-block')
      expect(error.params).toEqual({ block_id: '123' })
    })
  })

  describe('ValidationError', () => {
    it('should create validation error with field', () => {
      const error = new ValidationError('Invalid value', 'title')

      expect(error.type).toBe('ValidationError')
      expect(error.code).toBe('validation_error')
      expect(error.httpStatus).toBe(400)
      expect(error.message).toBe('Invalid value')
      expect(error.retryable).toBe(false)
      expect(error.suggestion).toContain('title')
    })

    it('should create validation error without field', () => {
      const error = new ValidationError('Invalid parameters')

      expect(error.suggestion).toContain('paramètres')
    })
  })

  describe('PermissionError', () => {
    it('should create permission error', () => {
      const error = new PermissionError('Access denied')

      expect(error.type).toBe('PermissionError')
      expect(error.code).toBe('forbidden')
      expect(error.httpStatus).toBe(403)
      expect(error.retryable).toBe(false)
      expect(error.suggestion).toContain('intégration')
    })
  })

  describe('NotFoundError', () => {
    it('should create not found error with resource type', () => {
      const error = new NotFoundError('Block not found', 'block')

      expect(error.type).toBe('NotFoundError')
      expect(error.code).toBe('object_not_found')
      expect(error.httpStatus).toBe(404)
      expect(error.suggestion).toContain('block')
    })

    it('should create not found error without resource type', () => {
      const error = new NotFoundError('Resource not found')

      expect(error.suggestion).toContain('non trouvée')
    })
  })

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Concurrent modification')

      expect(error.type).toBe('ConflictError')
      expect(error.code).toBe('conflict')
      expect(error.httpStatus).toBe(409)
      expect(error.retryable).toBe(true)
      expect(error.suggestion).toContain('conflit')
    })
  })

  describe('RateLimitError', () => {
    it('should create rate limit error with retryAfter', () => {
      const error = new RateLimitError('Too many requests', 5)

      expect(error.type).toBe('RateLimitError')
      expect(error.code).toBe('rate_limited')
      expect(error.httpStatus).toBe(429)
      expect(error.retryable).toBe(true)
      expect(error.retryAfter).toBe(5)
      expect(error.suggestion).toContain('5')
    })

    it('should include retryAfter in toJSON', () => {
      const error = new RateLimitError('Too many requests', 10)

      const json = error.toJSON()

      expect(json.retryAfter).toBe(10)
    })

    it('should create rate limit error without retryAfter', () => {
      const error = new RateLimitError('Too many requests')

      expect(error.retryAfter).toBeUndefined()
      expect(error.suggestion).not.toContain('seconde')
    })

    it('should not include retryAfter in toJSON when undefined', () => {
      const error = new RateLimitError('Too many requests')

      const json = error.toJSON()

      expect(json).not.toHaveProperty('retryAfter')
    })
  })

  describe('ServerError', () => {
    it('should create server error', () => {
      const error = new ServerError('Internal server error')

      expect(error.type).toBe('ServerError')
      expect(error.code).toBe('internal_server_error')
      expect(error.httpStatus).toBe(500)
      expect(error.retryable).toBe(true)
      expect(error.suggestion).toContain('serveur')
    })
  })
})

describe('Error Mapping Function', () => {
  function createHttpClientError(
    status: number,
    message: string,
    data?: any
  ): HttpClientError {
    const headers = new Headers()
    return new HttpClientError(message, status, data, headers)
  }

  describe('HTTP Status Mapping', () => {
    it('should map 400 to ValidationError', () => {
      const error = createHttpClientError(400, 'Bad Request', {
        message: 'Invalid input',
        field: 'title'
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(ValidationError)
      expect(mcpError.httpStatus).toBe(400)
      expect(mcpError.message).toBe('Invalid input')
    })

    it('should map 401 to AuthenticationError', () => {
      const error = createHttpClientError(401, 'Unauthorized', {
        message: 'Invalid token'
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(AuthenticationError)
      expect(mcpError.httpStatus).toBe(401)
      expect(mcpError.code).toBe('unauthorized')
    })

    it('should map 403 with permission_required to PermissionError', () => {
      const error = createHttpClientError(403, 'Forbidden', {
        message: 'Access denied',
        code: 'permission_required'
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(PermissionError)
      expect(mcpError.httpStatus).toBe(403)
      expect(mcpError.code).toBe('forbidden')
    })

    it('should map 403 without permission_required to AuthenticationError', () => {
      const error = createHttpClientError(403, 'Forbidden', {
        message: 'Access denied'
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(AuthenticationError)
      expect(mcpError.httpStatus).toBe(403)
    })

    it('should map 404 to NotFoundError', () => {
      const error = createHttpClientError(404, 'Not Found', {
        message: 'Resource not found'
      })

      const mcpError = mapNotionErrorToMCPError(error, 'retrieve-a-page')

      expect(mcpError).toBeInstanceOf(NotFoundError)
      expect(mcpError.httpStatus).toBe(404)
      expect(mcpError.suggestion).toContain('page')
    })

    it('should map 409 to ConflictError', () => {
      const error = createHttpClientError(409, 'Conflict', {
        message: 'Concurrent modification'
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(ConflictError)
      expect(mcpError.httpStatus).toBe(409)
      expect(mcpError.retryable).toBe(true)
    })

    it('should map 429 to RateLimitError', () => {
      const headers = new Headers()
      headers.set('Retry-After', '10')
      const error = new HttpClientError('Too Many Requests', 429, {
        message: 'Rate limit exceeded'
      }, headers)

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(RateLimitError)
      expect(mcpError.httpStatus).toBe(429)
      if (mcpError instanceof RateLimitError) {
        expect(mcpError.retryAfter).toBe(10)
      }
    })

    it('should map 500 to ServerError', () => {
      const error = createHttpClientError(500, 'Internal Server Error', {
        message: 'Something went wrong'
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(ServerError)
      expect(mcpError.httpStatus).toBe(500)
    })

    it('should map 502 to ServerError', () => {
      const error = createHttpClientError(502, 'Bad Gateway')

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(ServerError)
    })

    it('should map 503 to ServerError', () => {
      const error = createHttpClientError(503, 'Service Unavailable')

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(ServerError)
    })

    it('should map 504 to ServerError', () => {
      const error = createHttpClientError(504, 'Gateway Timeout')

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(ServerError)
    })
  })

  describe('Operation and Params Preservation', () => {
    it('should preserve operation name in error', () => {
      const error = createHttpClientError(404, 'Not Found')
      const mcpError = mapNotionErrorToMCPError(error, 'query-a-database')

      expect(mcpError.operation).toBe('query-a-database')
    })

    it('should preserve params in error', () => {
      const error = createHttpClientError(404, 'Not Found')
      const params = { database_id: '123', filter: { property: 'title' } }
      const mcpError = mapNotionErrorToMCPError(error, 'query-a-database', params)

      expect(mcpError.params).toEqual(params)
    })

    it('should handle missing operation and params', () => {
      const error = createHttpClientError(404, 'Not Found')
      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError.operation).toBeUndefined()
      expect(mcpError.params).toBeUndefined()

      const json = mcpError.toJSON()
      expect(json).not.toHaveProperty('operation')
      expect(json).not.toHaveProperty('params')
    })
  })

  describe('Resource Type Inference', () => {
    it('should infer page resource type from operation', () => {
      const error = createHttpClientError(404, 'Not Found')
      const mcpError = mapNotionErrorToMCPError(error, 'retrieve-a-page')

      expect(mcpError).toBeInstanceOf(NotFoundError)
      expect(mcpError.suggestion).toContain('page')
    })

    it('should infer block resource type from operation', () => {
      const error = createHttpClientError(404, 'Not Found')
      const mcpError = mapNotionErrorToMCPError(error, 'retrieve-a-block')

      expect(mcpError).toBeInstanceOf(NotFoundError)
      expect(mcpError.suggestion).toContain('block')
    })

    it('should infer database resource type from operation', () => {
      const error = createHttpClientError(404, 'Not Found')
      const mcpError = mapNotionErrorToMCPError(error, 'retrieve-a-database')

      expect(mcpError).toBeInstanceOf(NotFoundError)
      expect(mcpError.suggestion).toContain('database')
    })

    it('should infer data_source resource type from operation', () => {
      const error = createHttpClientError(404, 'Not Found')
      const mcpError = mapNotionErrorToMCPError(error, 'query-a-data-source')

      expect(mcpError).toBeInstanceOf(NotFoundError)
      expect(mcpError.suggestion).toContain('database')
    })

    it('should infer user resource type from operation', () => {
      const error = createHttpClientError(404, 'Not Found')
      const mcpError = mapNotionErrorToMCPError(error, 'retrieve-a-user')

      expect(mcpError).toBeInstanceOf(NotFoundError)
      expect(mcpError.suggestion).toContain('user')
    })
  })

  describe('Notion API Error Data Extraction', () => {
    it('should extract message from Notion error response', () => {
      const error = createHttpClientError(400, 'Bad Request', {
        message: 'The provided title is too long'
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError.message).toBe('The provided title is too long')
    })

    it('should extract field from Notion error response', () => {
      const error = createHttpClientError(400, 'Bad Request', {
        message: 'Validation error',
        field: 'title'
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(ValidationError)
      expect(mcpError.suggestion).toContain('title')
    })

    it('should extract code from Notion error response', () => {
      const error = createHttpClientError(403, 'Forbidden', {
        message: 'Permission required',
        code: 'permission_required'
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(PermissionError)
    })

    it('should extract retry_after from Notion error response', () => {
      const error = createHttpClientError(429, 'Too Many Requests', {
        message: 'Rate limited',
        retry_after: 30
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(RateLimitError)
      if (mcpError instanceof RateLimitError) {
        expect(mcpError.retryAfter).toBe(30)
      }
    })

    it('should handle string retry_after value', () => {
      const error = createHttpClientError(429, 'Too Many Requests', {
        message: 'Rate limited',
        retry_after: '15'
      })

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(RateLimitError)
      if (mcpError instanceof RateLimitError) {
        expect(mcpError.retryAfter).toBe(15)
      }
    })

    it('should handle missing error data', () => {
      const error = createHttpClientError(404, 'Not Found')

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError.message).toBe('Not Found')
    })

    it('should handle non-object error data', () => {
      const error = createHttpClientError(404, 'Not Found', 'Plain string error')

      const mcpError = mapNotionErrorToMCPError(error)

      expect(mcpError).toBeInstanceOf(NotFoundError)
    })
  })
})
