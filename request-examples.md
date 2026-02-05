# Requêtes Concrètes - Solution A

## 1. Depuis Claude Desktop / Cursor (via le client MCP)

Le client MCP envoie automatiquement les paramètres via JSON-RPC :

### Format 'summary'

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "API-query-data-source",
    "arguments": {
      "data_source_id": "abc123-def456-ghi789",
      "filter": {
        "property": "Status",
        "select": {
          "equals": "En cours"
        }
      },
      "_output": "summary"
    }
  }
}
```

**Réponse** : ~1 KB au lieu de ~3.5 KB

### Format 'fields' (champs spécifiques)

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "API-query-data-source",
    "arguments": {
      "data_source_id": "abc123-def456-ghi789",
      "_fields": ["id", "Premier email", "Status", "Température"]
    }
  }
}
```

### Format 'structured' (MCP 2025-06-18)

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "API-query-data-source",
    "arguments": {
      "data_source_id": "abc123-def456-ghi789",
      "_structured": true,
      "_output": "summary"
    }
  }
}
```

---

## 2. Prompt Naturel à l'IA

L'utilisateur ne voit pas ces détails. Voici ce que l'utilisateur écrirait :

### Exemple 1 : Résumé

> **Utilisateur** : "Montre-moi tous les prospects avec le statut 'En cours', donne-moi un résumé"

> **IA traduit en** :
```json
{
  "name": "API-query-data-source",
  "arguments": {
    "data_source_id": "...",
    "filter": { "property": "Status", "select": { "equals": "En cours" } },
    "_output": "summary"
  }
}
```

### Exemple 2 : Champs spécifiques

> **Utilisateur** : "Je veux juste l'email et le statut de tous mes contacts"

> **IA traduit en** :
```json
{
  "name": "API-query-data-source",
  "arguments": {
    "data_source_id": "...",
    "_fields": ["Premier email", "Status"]
  }
}
```

### Exemple 3 : Liste simple

> **Utilisateur** : "Liste juste les IDs des pages à traiter"

> **IA traduit en** :
```json
{
  "name": "API-query-data-source",
  "arguments": {
    "data_source_id": "...",
    "_output": "minimal"
  }
}
```

---

## 3. Depuis un Script Python (Client MCP)

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import asyncio

async def query_with_summary():
    server_params = StdioServerParameters(
        command="npx",
        args=["@notionhq/notion-mcp-server"]
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Initialiser
            await session.initialize()

            # Appeler avec format summary
            result = await session.call_tool(
                name="API-query-data-source",
                arguments={
                    "data_source_id": "abc123-def456-ghi789",
                    "filter": {
                        "property": "Status",
                        "select": {"equals": "En cours"}
                    },
                    "_output": "summary"  # ← Nouveau paramètre
                }
            )

            print(result.content[0].text)
```

---

## 4. Depuis un Script TypeScript/Node

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function queryNotion() {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['@notionhq/notion-mcp-server']
  });

  const client = new Client({
    name: 'my-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  await client.connect(transport);

  // Format summary
  const result = await client.callTool({
    name: 'API-query-data-source',
    arguments: {
      data_source_id: 'abc123-def456-ghi789',
      _output: 'summary'
    }
  });

  console.log(result.content[0].text);
}
```

---

## 5. Depuis curl (pour tester directement le MCP server)

```bash
# Démarrer le serveur en mode HTTP
npx @notionhq/notion-mcp-server --transport http --port 3000

# Puis faire une requête
curl -X POST http://localhost:3000/mcp/v1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_NOTION_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "API-query-data-source",
      "arguments": {
        "data_source_id": "abc123-def456-ghi789",
        "_output": "summary"
      }
    }
  }'
```

---

## 6. Comment Gemini (ou autre IA) l'utiliserait

### Avant (compliqué)

> **Gemini** : "Je vais appeler query-data-source avec un filtre complexe..."
```json
{
  "filter": {
    "property": "YYfp",  // ← Doit connaître l'ID obscur
    "email": { "equals": "test@example.com" }
  }
}
```

### Après (simple avec _output)

> **Gemini** : "Je récupère les données en format summary pour réduire la taille..."
```json
{
  "data_source_id": "...",
  "_output": "summary"  // ← Simple, intuitif
}
```

---

## 7. Variante : Paramètres Globaux (Configuration)

On pourrait aussi permettre de configurer un format par défaut :

```bash
# Variable d'environnement
export NOTION_MCP_OUTPUT_FORMAT="summary"

# Ou dans la config
~/.config/notion-mcp/config.json:
{
  "defaultOutputFormat": "summary",
  "defaultFields": ["id", "Premier email", "Status"]
}
```

Alors toutes les requêtes utiliseraient ce format par défaut, sauf si explicitement surchargé.

---

## 8. Compatibilité avec Outils Existants

### Rétrocompatible : Les paramètres _* sont optionnels

```json
// Ancienne requête (toujours valide)
{
  "name": "API-query-data-source",
  "arguments": {
    "data_source_id": "abc123-def456-ghi789",
    "filter": { ... }
  }
}
// → Retourne le format 'full' par défaut (comportement actuel)

// Nouvelle requête avec option
{
  "name": "API-query-data-source",
  "arguments": {
    "data_source_id": "abc123-def456-ghi789",
    "filter": { ... },
    "_output": "summary"  // ← Nouveau paramètre optionnel
  }
}
// → Retourne le format 'summary'
```

---

## 9. Comment le Prompt de l'IA pourrait décrire ces options

On pourrait ajouter une description dans le `inputSchema` des outils pour que l'IA sache que ces options existent :

```typescript
// Dans parser.ts, lors de la génération de l'inputSchema
inputSchema.properties!['_output'] = {
  type: 'string',
  enum: ['full', 'summary', 'minimal'],
  description: 'Format de réponse souhaité. full=complet, summary=résumé (-70%), minimal=essentiel (-90%)'
}

inputSchema.properties!['_fields'] = {
  type: 'array',
  items: { type: 'string' },
  description: 'Liste des noms de propriétés à retourner (ex: ["id", "Status", "Email"])'
}

inputSchema.properties!['_structured'] = {
  type: 'boolean',
  description: 'Si true, utilise le format MCP structuredContent (spec 2025-06-18)'
}
```

Ainsi, l'IA découvrira automatiquement ces options lors du `tools/list` initial !

---

## Résumé

**Pour l'utilisateur final** : Rien ne change ! Il écrira des prompts naturels comme "donne-moi un résumé des prospects en cours".

**Pour l'IA (Gemini, Claude, GPT)** : Elle découvrira automatiquement les nouveaux paramètres `_output`, `_fields`, `_structured` et les utilisera intelligemment.

**Pour les développeurs** : Ils peuvent utiliser ces paramètres directement dans leurs scripts clients MCP.
