# Stratégie de Transformation : Approche Pragmatique

## Problème Identifié

**Toutes** les opérations Notion retournent des réponses volumineuses :

| Opération | Type | Taille Réponse | Exemple |
|-----------|------|----------------|---------|
| `query-data-source` | GET | ~3-8 KB | Liste de pages avec propriétés complètes |
| `retrieve-a-page` | GET | ~2-5 KB | Page avec toutes ses propriétés |
| `patch-page` | PATCH | ~2-5 KB | Page modifiée (complète) |
| `update-a-data-source` | PATCH | ~3-6 KB | Data source + schéma de propriétés |
| `create-a-database` | POST | ~3-6 KB | Database créée (complète) |
| `post-search` | POST | ~2-10 KB | Résultats de recherche |

## Solution : Mode "Smart" par Défaut

### Option 1 : Configuration Globale (Recommandée)

```bash
# Variable d'environnement
export NOTION_MCP_OUTPUT_MODE="smart"  # nouveau défaut

# Modes disponibles:
# - "full"     = comportement actuel (rétrocompatible)
# - "smart"    = résumé intelligent par défaut (-60 à -80%)
# - "minimal"  = ultra-minimal par défaut (-90%)
```

### Option 2 : Configuration par Type d'Opération

```typescript
// Configuration par défaut intelligente
const DEFAULT_MODES = {
  // Query/List → summary par défaut (plusieurs résultats)
  'query-data-source': 'summary',
  'post-search': 'summary',
  'get-block-children': 'summary',

  // Retrieve → minimal par défaut (un seul résultat)
  'retrieve-a-page': 'minimal',
  'retrieve-a-block': 'minimal',
  'retrieve-a-data-source': 'summary',  // garde le schéma des propriétés

  // Write → minimal par défaut (confirmation de succès)
  'patch-page': 'minimal',
  'update-a-data-source': 'minimal',
  'create-a-database': 'minimal',

  // Delete → full (souvent juste un message)
  'delete-a-block': 'full',
  'delete-a-page': 'full'
}
```

---

## Exemples Concrets

### Avant (Comportement Actuel)

```typescript
// query-data-source
{
  "results": [{
    "id": "...",
    "created_time": "2026-02-05T14:32:00.000Z",
    "last_edited_time": "...",
    "created_by": {...},
    "last_edited_by": {...},
    "cover": null,
    "icon": null,
    "parent": {...},
    "archived": false,
    "in_trash": false,
    "is_locked": false,
    "properties": {
      "PRENOM": {
        "id": "CjG%3D",
        "type": "rich_text",
        "rich_text": [{
          "type": "text",
          "text": {"content": "Han", "link": null},
          "annotations": {...},
          "plain_text": "Han",
          "href": null
        }]
      },
      // ... 10 autres propriétés
    },
    "url": "https://www.notion.so/...",
    "public_url": null
  }]
}
// ~8 KB
```

### Après (Mode "smart" par défaut)

```typescript
// query-data-source avec NOTION_MCP_OUTPUT_MODE="smart"
{
  "_mode": "smart",
  "total": 2,
  "results": [{
    "id": "2fe2b0a4-6124-81b8-ae65-cc5eb4771c89",
    "title": "Solo",
    "properties": {
      "PRENOM": "Han",
      "NOM": "Solo",
      "Species": "Human",
      "Homeworld": "Corellia",
      "Affiliation": ["Rebel Alliance", "Outer Rim"],
      "Quote": "Never tell me the odds!"
    },
    "url": "https://www.notion.so/..."
  }]
}
// ~800 B (-90%)
```

### Pour les Write (Update/Create)

```typescript
// update-a-data-source en mode "smart"
{
  "_mode": "smart",
  "success": true,
  "id": "b238891d-a864-47cb-b399-ea398e0eff69",
  "title": "Star Wars Characters",
  "updated_properties": ["PRENOM", "Species"],
  "last_edited": "2026-02-05T14:46:00.000Z"
}
// ~300 B au lieu de ~4 KB
```

---

## Override par Requête

L'utilisateur peut toujours demander le format complet :

```typescript
// Force le format full pour une requête spécifique
await mcp.call('query-data-source', {
  data_source_id': 'xxx',
  _output': 'full'  // override temporaire
})
```

---

## Comparaison des Modes

| Mode | Query | Retrieve | Write | Delete | Taille |
|------|-------|----------|-------|--------|--------|
| **full** | Complet | Complet | Complet | Message | 100% |
| **smart** | Summary | Minimal | Confirmation | Message | ~20% |
| **minimal** | IDs only | ID + title | ID only | Message | ~5% |

---

## Implémentation Proposée

```typescript
// src/config.ts
export const DEFAULT_MODE = process.env.NOTION_MCP_OUTPUT_MODE || 'full';

// src/openapi-mcp-server/mcp/proxy.ts
export class MCPProxy {
  private defaultMode: string;

  constructor(...) {
    this.defaultMode = process.env.NOTION_MCP_OUTPUT_MODE || 'full';
  }

  private getOperationMode(operationId: string): string {
    // Mode par défaut global
    if (this.defaultMode !== 'smart') {
      return this.defaultMode;
    }

    // Modes intelligents par opération
    const SMART_MODES: Record<string, string> = {
      'query-data-source': 'summary',
      'post-search': 'summary',
      'retrieve-a-page': 'minimal',
      'patch-page': 'minimal',
      'update-a-data-source': 'minimal',
      // ...
    };

    return SMART_MODES[operationId] || 'minimal';
  }

  // Dans CallToolRequestSchema handler
  const response = await this.httpClient.executeOperation(operation, deserializedParams);

  // Déterminer le mode
  const requestedMode = (deserializedParams as any)._output;
  const defaultMode = this.getOperationMode(operation.operationId);
  const mode = requestedMode || defaultMode;

  // Transformer selon le mode
  const transformedData = this.transformer.transform(response.data, {
    mode: mode,
    operation: operation.operationId
  });
}
```

---

## Migration en Douceur

### Phase 1 : Rétrocompatible (Actuel)
- Par défaut : `full` (comportement actuel)
- Optionnel : `_output: 'smart'` ou `'minimal'`

### Phase 2 : Opt-in Smart
- Nouveau défaut : `full` (pour compatibilité)
- Recommandé : `NOTION_MCP_OUTPUT_MODE="smart"`
- Override : `_output: 'full'` disponible

### Phase 3 : Smart par Défaut (Futur)
- Nouveau défaut : `smart`
- Optionnel : `_output: 'full'` pour les vieux clients
- Configurable : par variable d'environnement

---

## Réponse à Votre Question

> "ça concerne quels usages, tous ou pas ?"

**Réponse** : **OUI, tous les usages** :

- ✅ **Lecture** (query, retrieve, search) → Énorme gain
- ✅ **Écriture** (patch, update, create) → Aussi énorme gain
- ✅ **Suppression** (delete) → Gain minime mais cohérent

**La clé** : Mode "smart" par défaut avec override possible.

---

## Exemple de Votre Flux Actuel

```bash
# Avant : 12 KB de JSON
✓ API-query-data-source {...} → 8 KB
✓ API-update-a-data-source {...} → 4 KB

# Après (mode smart) : 1.1 KB de JSON
✓ API-query-data-source {...} → 800 B (-90%)
✓ API-update-a-data-source {...} → 300 B (-92%)
```

**Gain total : ~91% de réduction** 🎉
