// Base error class
export class MCPNotionError extends Error {
  constructor(
    public type: string,
    public code: string,
    public httpStatus: number,
    message: string,
    public retryable: boolean = false,
    public suggestion?: string,
    public operation?: string,
    public params?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'MCPNotionError'
  }

  toJSON() {
    return {
      type: this.type,
      code: this.code,
      httpStatus: this.httpStatus,
      message: this.message,
      retryable: this.retryable,
      suggestion: this.suggestion,
      ...(this.operation && { operation: this.operation }),
      ...(this.params && { params: this.params })
    }
  }
}

// Specific error types
export class AuthenticationError extends MCPNotionError {
  constructor(message: string, operation?: string, params?: Record<string, unknown>, httpStatus: number = 401) {
    super('AuthenticationError', httpStatus === 403 ? 'forbidden' : 'unauthorized', httpStatus, message, false,
      httpStatus === 403
        ? 'Votre intégration n\'a pas accès à cette ressource. Vérifiez les permissions.'
        : 'Vérifiez que votre token NOTION_TOKEN commence par "ntn_" et est valide.',
      operation, params)
  }
}

export class ValidationError extends MCPNotionError {
  constructor(message: string, field?: string, operation?: string, params?: Record<string, unknown>) {
    super('ValidationError', 'validation_error', 400, message, false,
      field ? `Le champ "${field}" est invalide ou manquant.` : 'Vérifiez vos paramètres.',
      operation, params)
  }
}

export class PermissionError extends MCPNotionError {
  constructor(message: string, operation?: string, params?: Record<string, unknown>) {
    super('PermissionError', 'forbidden', 403, message, false,
      'Votre intégration n\'a pas les permissions nécessaires. Ajoutez la ressource via les paramètres d\'intégration.',
      operation, params)
  }
}

export class NotFoundError extends MCPNotionError {
  constructor(message: string, resourceType?: string, operation?: string, params?: Record<string, unknown>) {
    super('NotFoundError', 'object_not_found', 404, message, false,
      resourceType ? `La ressource de type "${resourceType}" n'existe pas ou n'est pas partagée avec votre intégration.` : 'Ressource non trouvée.',
      operation, params)
  }
}

export class ConflictError extends MCPNotionError {
  constructor(message: string, operation?: string, params?: Record<string, unknown>) {
    super('ConflictError', 'conflict', 409, message, true,
      'Un conflit est survenu (modification simultanée). Veuillez réessayer.',
      operation, params)
  }
}

export class RateLimitError extends MCPNotionError {
  constructor(message: string, retryAfter?: number, operation?: string, params?: Record<string, unknown>) {
    super('RateLimitError', 'rate_limited', 429, message, true,
      retryAfter ? `Attendez ${retryAfter} seconde(s) avant de réessayer.` : 'Ralentissez les requêtes.',
      operation, params)
    this.retryAfter = retryAfter
  }

  retryAfter?: number

  toJSON() {
    return {
      ...super.toJSON(),
      ...(this.retryAfter !== undefined && { retryAfter: this.retryAfter })
    }
  }
}

export class ServerError extends MCPNotionError {
  constructor(message: string, operation?: string, params?: Record<string, unknown>) {
    super('ServerError', 'internal_server_error', 500, message, true,
      'Une erreur serveur est survenue. Veuillez réessayer dans quelques instants.',
      operation, params)
  }
}
