# Analyse : Gestion des Erreurs - Notion MCP Server

## Architecture Actuelle

### Flux de gestion des erreurs

```
┌─────────────────────────────────────────────────────────────────┐
│ AI Client (OpenCode, Gemini, Claude)                          │
└────────────────┬────────────────────────────────────────────────┘
                 │ tools/call avec params
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ proxy.ts: CallToolRequestSchema handler                        │
│  - deserializeParams()                                         │
│  - extractTransformationParams()                               │
│  - httpClient.executeOperation()                               │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ http-client.ts: executeOperation()                              │
│  - Prépare la requête                                          │
│  - Appelle l'API Notion                                        │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼ (erreur ou succès)
        ┌────────┴────────┐
        │                 │
   Succès          Erreur HTTP
        │                 │
        ▼                 ▼
   transformData   HttpClientError
        │           {status, data, headers}
        ▼                 │
   Return           │
        │                 ▼
        │      proxy.ts catch block
        │      - console.error()
        │      - Extract error.data
        │      - Return {content: [{text: JSON.stringify({...)}}]}
        │                 │
        └─────────────────┘
                     ▼
              Return to AI Client
```

---

## Problèmes Identifiés

### 1. Format d'erreur incohérent

**Actuel (proxy.ts:181-184)** :
```json
{
  "status": "error",  // ← Toujours "error", pas le vrai HTTP status
  "...": "...",       // ← Données brutes de Notion
  "data": {...}       // ← Parfois
}
```

**Problème** : Pas de structure unifiée, l'IA doit deviner comment interpréter l'erreur.

### 2. Perte d'information HTTP

```typescript
// TODO: get this from http status code?
status: 'error',  // ← Le vrai HTTP status (400, 401, etc.) est perdu !
```

### 3. Pas de distinction des types d'erreur

- **ValidationError** (400) : Mauvais paramètres
- **AuthenticationError** (401) : Token invalide
- **PermissionError** (403) : Pas d'accès
- **NotFoundError** (404) : Ressource inexistante
- **ConflictError** (409) : Concurrency
- **RateLimitError** (429) : Trop de requêtes
- **ServerError** (500) : Erreur Notion

**Actuel** : Toutes retournées de la même manière → L'IA ne peut pas adapter son comportement.

---

## Exemples Concrets de Discussions Agent LLM

### Scénario 1 : Token invalide (401)

**Utilisateur** : "Liste mes bases de données"

**Agent** : Appelle `query-data-source`

**Réponse Notion** :
```json
{
  "object": "error",
  "status": 401,
  "code": "unauthorized",
  "message": "The bearer token is not valid."
}
```

**Ce que reçoit l'agent actuellement** :
```json
{
  "status": "error",
  "object": "error",
  "code": "unauthorized",
  "message": "The bearer token is not valid."
}
```

**Problème** : L'agent voit `status: "error"` au lieu de `status: 401`, donc il ne sait pas que c'est un problème d'authentification.

**Réponse typique de l'agent** : "Il y a eu une erreur avec l'API Notion. Veuillez vérifier vos paramètres."

**Ce qu'il devrait dire** : "Votre token d'authentification Notion n'est pas valide. Veuillez vérifier votre intégration."

---

### Scénario 2 : Page non trouvée (404)

**Utilisateur** : "Modifie la page XYZ"

**Agent** : Appelle `patch-page` avec `page_id: "xyz"`

**Réponse Notion** :
```json
{
  "object": "error",
  "status": 404,
  "code": "object_not_found",
  "message": "Could not find page with id: xyz."
}
```

**Ce que reçoit l'agent** :
```json
{
  "status": "error",
  "object": "error",
  "code": "object_not_found",
  "message": "Could not find page with id: xyz."
}
```

**Problème** : Le code `object_not_found` est là, mais l'agent doit faire un mapping manuel.

**Réponse typique** : "Erreur lors de la modification de la page. Vérifiez l'ID de la page."

**Ce qu'il devrait dire** : "La page avec l'ID 'xyz' n'existe pas ou n'est pas accessible par votre intégration."

---

### Scénario 3 : Rate limiting (429)

**Utilisateur** : "Importe mes 500 contacts"

**Agent** : Fait 50 requêtes rapidement

**Réponse Notion** :
```json
{
  "object": "error",
  "status": 429,
  "code": "rate_limited",
  "message": "This request exceeds the number of requests allowed. Slow down and try again."
}
```

**Problème** : L'agent ne sait pas qu'il doit attendre (retry-after).

**Réponse typique** : "Erreur de rate limiting. Veuillez réessayer."

**Ce qu'il devrait dire** : "Limite de requêtes atteinte. Attendons quelques secondes avant de réessayer..." [et faire un retry avec délai]

---

### Scénario 4 : Validation error (400)

**Utilisateur** : "Crée une page avec titre vide"

**Agent** : Appelle `create-a-page` sans titre

**Réponse Notion** :
```json
{
  "object": "error",
  "status": 400,
  "code": "validation_error",
  "message": "Title is required."
}
```

**Problème** : L'agent ne sait pas quel champ est invalide.

**Réponse typique** : "Erreur de validation. Vérifiez vos paramètres."

**Ce qu'il devrait dire** : "Le titre est obligatoire pour créer une page. Veuillez en fournir un."

---

### Scénario 5 : Conflit (409)

**Utilisateur** : "Modifie le statut en Terminé"

**Agent** : Appelle `patch-page`

**Réponse Notion** :
```json
{
  "object": "error",
  "status": 409,
  "code": "conflict",
  "message": "Conflict occurred while saving. Please try again."
}
```

**Problème** : L'agent ne sait pas qu'il doit réessayer.

**Réponse typique** : "Conflit survenu. Erreur."

**Ce qu'il devrait dire** : "Un conflit est survenu (probablement une modification simultanée). Je vais réessayer..."

---

## Propriétés d'une Bonne Gestion d'Erreur pour LLM

1. **Code d'erreur explicite** : L'IA doit savoir IMMÉDIATEMENT quel type d'erreur c'est
2. **Message actionnable** : Que l'IA doit dire à l'utilisateur
3. **Suggestion de réparation** : Que l'IA peut faire automatiquement (retry, attendre, demander un autre param)
4. **Contexte préservé** : Quelle opération a échoué, avec quels params
5. **Format structuré** : Pour que l'IA puisse parser et agir intelligemment

---

## Propositions d'Amélioration

### Option 1 : Erreurs MCP Structurées (Recommandé)

Utiliser le champ `isError` du protocole MCP + format structuré :

```typescript
// proxy.ts - améliorer le catch block
} catch (error) {
  const mcpError = this.formatMCPError(error, operation, apiParams)

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(mcpError.userMessage)
    }],
    isError: true,  // ← Champ MCP standard
    _error: {        // ← Métadonnées d'erreur structurées pour l'IA
      type: mcpError.type,
      code: mcpError.code,
      httpStatus: mcpError.httpStatus,
      retryable: mcpError.retryable,
      suggestion: mcpError.suggestion
    }
  }
}
```

**Format de réponse** :
```json
{
  "content": [{
    "type": "text",
    "text": "❌ Erreur d'authentification: Votre token Notion n'est pas valide. Veuillez vérifier votre intégration."
  }],
  "isError": true,
  "_error": {
    "type": "AuthenticationError",
    "code": "unauthorized",
    "httpStatus": 401,
    "retryable": false,
    "suggestion": "Vérifiez que votre token NOTION_TOKEN commence par 'ntn_' et n'a pas expiré.",
    "operation": "query-data-source",
    "params": {"data_source_id": "..."}
  }
}
```

---

### Option 2 : Codes d'erreur Spécifiques

Créer des classes d'erreur TypeScript :

```typescript
// src/openapi-mcp-server/mcp/errors.ts
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
}

export class AuthenticationError extends MCPNotionError {
  constructor(message: string, operation?: string, params?: Record<string, unknown>) {
    super('AuthenticationError', 'unauthorized', 401, message, false,
      'Vérifiez votre token NOTION_TOKEN dans les variables d\'environnement.',
      operation, params)
  }
}

export class ValidationError extends MCPNotionError {
  constructor(message: string, field?: string, operation?: string, params?: Record<string, unknown>) {
    super('ValidationError', 'validation_error', 400, message, false,
      field ? `Le champ '${field}' est invalide ou manquant.` : 'Vérifiez vos paramètres.',
      operation, params)
  }
}

export class NotFoundError extends MCPNotionError {
  constructor(message: string, resourceType?: string, operation?: string, params?: Record<string, unknown>) {
    super('NotFoundError', 'object_not_found', 404, message, false,
      resourceType ? `La ressource de type '${resourceType}' n'existe pas ou n'est pas partagée avec votre intégration.` : undefined,
      operation, params)
  }
}

export class RateLimitError extends MCPNotionError {
  constructor(message: string, retryAfter?: number, operation?: string, params?: Record<string, unknown>) {
    super('RateLimitError', 'rate_limited', 429, message, true,
      retryAfter ? `Attendez ${retryAfter} secondes avant de réessayer.` : 'Ralentissez les requêtes.',
      operation, params)
    this.retryAfter = retryAfter
  }

  retryAfter?: number
}

export class ConflictError extends MCPNotionError {
  constructor(message: string, operation?: string, params?: Record<string, unknown>) {
    super('ConflictError', 'conflict', 409, message, true,
      'Un conflit est survenu. Je vais réessayer automatiquement.',
      operation, params)
  }
}
```

**Usage dans proxy.ts** :
```typescript
} catch (error) {
  if (error instanceof HttpClientError) {
    const notionError = error.data

    // Mapper vers les bonnes classes d'erreur
    switch (error.status) {
      case 401:
        throw new AuthenticationError(
          notionError.message || 'Token invalide',
          operation.operationId,
          apiParams
        )

      case 400:
        throw new ValidationError(
          notionError.message || 'Paramètres invalides',
          this.extractInvalidField(notionError),
          operation.operationId,
          apiParams
        )

      case 404:
        throw new NotFoundError(
          notionError.message || 'Ressource non trouvée',
          this.extractResourceType(operation),
          operation.operationId,
          apiParams
        )

      case 409:
        throw new ConflictError(
          notionError.message || 'Conflit détecté',
          operation.operationId,
          apiParams
        )

      case 429:
        const retryAfter = error.headers?.get('retry-after')
        throw new RateLimitError(
          notionError.message || 'Trop de requêtes',
          retryAfter ? parseInt(retryAfter) : undefined,
          operation.operationId,
          apiParams
        )

      default:
        throw new MCPNotionError(
          'UnknownError',
          'unknown_error',
          error.status,
          notionError.message || `Erreur HTTP ${error.status}`,
          error.status >= 500, // 5xx = retryable
          undefined,
          operation.operationId,
          apiParams
        )
    }
  }

  throw error
}
```

---

### Option 3 : Messages en Langage Naturel pour LLM

Générer des messages directement utilisables par l'IA :

```typescript
function formatUserMessage(error: MCPNotionError): string {
  const templates = {
    AuthenticationError: (err: AuthenticationError) =>
      `🔑 **Erreur d'authentification**\n\n${err.message}\n\n**Solution** : ${err.suggestion}`,

    ValidationError: (err: ValidationError) =>
      `⚠️ **Erreur de validation**\n\n${err.message}\n\n**Solution** : ${err.suggestion}`,

    NotFoundError: (err: NotFoundError) =>
      `🔍 **Ressource non trouvée**\n\n${err.message}\n\n**Détails** : ${err.suggestion}`,

    RateLimitError: (err: RateLimitError) =>
      `⏱️ **Limite de requêtes atteinte**\n\n${err.message}\n\n**Action** : ${err.suggestion}`,

    ConflictError: (err: ConflictError) =>
      `⚡ **Conflit détecté**\n\n${err.message}\n\n**Action** : ${err.suggestion} (réessai automatique...)`
  }

  const template = templates[error.constructor.name]
  return template ? template(error) : `❌ **Erreur** : ${error.message}`
}
```

**Ce que l'IA recevrait** :
```
⏱️ **Limite de requêtes atteinte**

This request exceeds the number of requests allowed. Slow down and try again.

**Action**: Attendrez 5 secondes avant de réessayer.
```

L'IA peut directement lire ce message et l'afficher à l'utilisateur !

---

## Comparaison Avant/Après

### Avant

**Réponse reçue par l'IA** :
```json
{"status": "error", "object": "error", "code": "rate_limited", "message": "..."}
```

**Ce que l'IA dit** : "Erreur lors de la requête. Veuillez réessayer."

**Problème** : L'utilisateur ne sait pas quoi faire, l'IA ne sait pas comment aider.

---

### Après

**Réponse reçue par l'IA** :
```json
{
  "content": [{
    "type": "text",
    "text": "⏱️ **Limite de requêtes atteinte**\n\nThis request exceeds the number of requests allowed. Slow down and try again.\n\n**Action** : Attendrez 5 secondes avant de réessayer."
  }],
  "isError": true,
  "_error": {
    "type": "RateLimitError",
    "code": "rate_limited",
    "httpStatus": 429,
    "retryable": true,
    "suggestion": "Attendez 5 secondes avant de réessayer.",
    "retryAfter": 5
  }
}
```

**Ce que l'IA peut faire** :
1. Afficher le message tel quel à l'utilisateur
2. Vérifier `retryable: true` et proposer un retry automatique
3. Attendre 5 secondes et réessayer automatiquement

---

## Implémentation Proposée

### 1. Créer `src/openapi-mcp-server/mcp/errors.ts`

Toutes les classes d'erreur avec mappings.

### 2. Mettre à jour `proxy.ts`

- Ajouter une fonction `mapNotionErrorToMCPError()`
- Intégrer dans le catch block
- Générer des messages user-friendly

### 3. Ajouter le retry automatique

```typescript
if (error instanceof RateLimitError || error instanceof ConflictError) {
  const waitTime = error.retryAfter || 5
  await new Promise(resolve => setTimeout(resolve, waitTime * 1000))
  // Retry la requête
}
```

### 4. Tests

Créer des tests pour chaque type d'erreur.

---

## Avantages

1. **Pour l'utilisateur** : Messages clairs sur ce qui ne va pas et comment le corriger
2. **Pour l'IA** : Peut prendre des décisions automatiques (retry, demander un nouveau param, etc.)
3. **Pour le développeur** : Debug plus facile avec des erreurs typées
4. **Rétrocompatible** : Utilise `isError` du protocole MCP standard

---

## Sources

- [Status codes - Notion Docs](https://developers.notion.com/reference/status-codes)
- [MCP Specification - Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
