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

export function formatUserMessage(error: MCPNotionError): string {
  if (error instanceof AuthenticationError) {
    return `🔑 **Erreur d'authentification**\n\n${error.message}\n\n**Solution** : ${error.suggestion}`
  }

  if (error instanceof ValidationError) {
    return `⚠️ **Erreur de validation**\n\n${error.message}\n\n**Solution** : ${error.suggestion}`
  }

  if (error instanceof PermissionError) {
    return `🔒 **Erreur de permission**\n\n${error.message}\n\n**Solution** : ${error.suggestion}`
  }

  if (error instanceof NotFoundError) {
    return `🔍 **Ressource non trouvée**\n\n${error.message}\n\n**Détails** : ${error.suggestion}`
  }

  if (error instanceof ConflictError) {
    return `⚡ **Conflit détecté**\n\n${error.message}\n\n**Action** : ${error.suggestion}`
  }

  if (error instanceof RateLimitError) {
    return `⏱️ **Limite de requêtes atteinte**\n\n${error.message}\n\n**Action** : ${error.suggestion}`
  }

  if (error instanceof ServerError) {
    return `🔴 **Erreur serveur**\n\n${error.message}\n\n**Action** : ${error.suggestion}`
  }

  return `❌ **Erreur** : ${error.message}`
}
