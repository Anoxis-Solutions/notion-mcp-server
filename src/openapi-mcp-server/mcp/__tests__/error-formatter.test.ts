import { describe, it, expect } from 'vitest'
import { formatUserMessage } from '../error-formatter'
import {
  AuthenticationError,
  ValidationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServerError
} from '../errors'

describe('Error Message Formatter', () => {
  describe('AuthenticationError formatting', () => {
    it('should format authentication error with emoji and structure', () => {
      const error = new AuthenticationError('Invalid token')
      const message = formatUserMessage(error)

      expect(message).toContain('🔑')
      expect(message).toContain('Erreur d\'authentification')
      expect(message).toContain('Invalid token')
      expect(message).toContain('Solution')
      expect(message).toContain('ntn_')
    })

    it('should format 403 authentication error correctly', () => {
      const error = new AuthenticationError('Access denied', 'retrieve-a-page', {}, 403)
      const message = formatUserMessage(error)

      expect(message).toContain('🔑')
      expect(message).toContain('Erreur d\'authentification')
      expect(message).toContain('Access denied')
      expect(message).toContain('intégration n\'a pas accès')
    })
  })

  describe('ValidationError formatting', () => {
    it('should format validation error with emoji and structure', () => {
      const error = new ValidationError('Invalid value', 'title')
      const message = formatUserMessage(error)

      expect(message).toContain('⚠️')
      expect(message).toContain('Erreur de validation')
      expect(message).toContain('Invalid value')
      expect(message).toContain('Solution')
      expect(message).toContain('title')
    })

    it('should format validation error without field', () => {
      const error = new ValidationError('Validation failed')
      const message = formatUserMessage(error)

      expect(message).toContain('⚠️')
      expect(message).toContain('paramètres')
    })
  })

  describe('PermissionError formatting', () => {
    it('should format permission error with emoji and structure', () => {
      const error = new PermissionError('Access to this resource is restricted')
      const message = formatUserMessage(error)

      expect(message).toContain('🔒')
      expect(message).toContain('Erreur de permission')
      expect(message).toContain('Access to this resource is restricted')
      expect(message).toContain('Solution')
      expect(message).toContain('intégration')
    })
  })

  describe('NotFoundError formatting', () => {
    it('should format not found error with emoji and structure', () => {
      const error = new NotFoundError('Page not found', 'page')
      const message = formatUserMessage(error)

      expect(message).toContain('🔍')
      expect(message).toContain('Ressource non trouvée')
      expect(message).toContain('Page not found')
      expect(message).toContain('Détails')
      expect(message).toContain('page')
    })

    it('should format not found error without resource type', () => {
      const error = new NotFoundError('Resource not found')
      const message = formatUserMessage(error)

      expect(message).toContain('🔍')
      expect(message).toContain('non trouvée')
    })
  })

  describe('ConflictError formatting', () => {
    it('should format conflict error with emoji and structure', () => {
      const error = new ConflictError('Concurrent modification detected')
      const message = formatUserMessage(error)

      expect(message).toContain('⚡')
      expect(message).toContain('Conflit détecté')
      expect(message).toContain('Concurrent modification detected')
      expect(message).toContain('Action')
      expect(message).toContain('conflit')
    })
  })

  describe('RateLimitError formatting', () => {
    it('should format rate limit error with retry after', () => {
      const error = new RateLimitError('Too many requests', 30)
      const message = formatUserMessage(error)

      expect(message).toContain('⏱️')
      expect(message).toContain('Limite de requêtes atteinte')
      expect(message).toContain('Too many requests')
      expect(message).toContain('Action')
      expect(message).toContain('30')
    })

    it('should format rate limit error without retry after', () => {
      const error = new RateLimitError('Rate limit exceeded')
      const message = formatUserMessage(error)

      expect(message).toContain('⏱️')
      expect(message).toContain('Ralentissez')
    })
  })

  describe('ServerError formatting', () => {
    it('should format server error with emoji and structure', () => {
      const error = new ServerError('Internal server error')
      const message = formatUserMessage(error)

      expect(message).toContain('🔴')
      expect(message).toContain('Erreur serveur')
      expect(message).toContain('Internal server error')
      expect(message).toContain('Action')
      expect(message).toContain('quelques instants')
    })
  })

  describe('Message structure', () => {
    it('should use markdown formatting for all error types', () => {
      const errors = [
        new AuthenticationError('Test'),
        new ValidationError('Test'),
        new PermissionError('Test'),
        new NotFoundError('Test'),
        new ConflictError('Test'),
        new RateLimitError('Test'),
        new ServerError('Test')
      ]

      errors.forEach(error => {
        const message = formatUserMessage(error)
        // All messages should contain markdown bold syntax
        expect(message).toContain('**')
      })
    })

    it('should include appropriate emoji for each error type', () => {
      const emojiMap = {
        AuthenticationError: '🔑',
        ValidationError: '⚠️',
        PermissionError: '🔒',
        NotFoundError: '🔍',
        ConflictError: '⚡',
        RateLimitError: '⏱️',
        ServerError: '🔴'
      }

      Object.entries(emojiMap).forEach(([errorType, emoji]) => {
        let error
        switch (errorType) {
          case 'AuthenticationError':
            error = new AuthenticationError('Test')
            break
          case 'ValidationError':
            error = new ValidationError('Test')
            break
          case 'PermissionError':
            error = new PermissionError('Test')
            break
          case 'NotFoundError':
            error = new NotFoundError('Test')
            break
          case 'ConflictError':
            error = new ConflictError('Test')
            break
          case 'RateLimitError':
            error = new RateLimitError('Test')
            break
          case 'ServerError':
            error = new ServerError('Test')
            break
        }
        const message = formatUserMessage(error!)
        expect(message).toContain(emoji)
      })
    })

    it('should be clear and actionable', () => {
      const error = new ValidationError('Title is required', 'title')
      const message = formatUserMessage(error)

      // Should contain the actual problem
      expect(message).toContain('Title is required')
      // Should contain guidance
      expect(message).toMatch(/Solution|Détails|Action/)
      // Should be formatted with line breaks for readability
      expect(message).toContain('\n')
    })
  })
})
