# Exemples de Transformation de Réponse - Solution A

## Réponse Notion Complète (Format 'full' - Actuel)

```json
{
  "object": "list",
  "results": [
    {
      "object": "page",
      "id": "page-uuid-1",
      "created_time": "2025-01-15T10:30:00.000Z",
      "last_edited_time": "2025-02-05T14:22:00.000Z",
      "archived": false,
      "in_trash": false,
      "parent": {
        "type": "database_id",
        "database_id": "data-source-uuid"
      },
      "properties": {
        "Premier email": {
          "id": "YYfp",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "contact@example.com",
                "link": null
              },
              "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
              },
              "plain_text": "contact@example.com",
              "href": null
            }
          ]
        },
        "Status": {
          "id": "HOEP",
          "type": "select",
          "select": {
            "id": "opt-uuid-1",
            "name": "En cours",
            "color": "blue"
          }
        },
        "Température": {
          "id": "XaQp",
          "type": "number",
          "number": 22.5
        },
        "Date de contact": {
          "id": "BmZl",
          "type": "date",
          "date": {
            "start": "2025-01-20",
            "end": null
          }
        }
      },
      "url": "https://notion.so/page-uuid-1",
      "public_url": null
    },
    {
      "object": "page",
      "id": "page-uuid-2",
      "created_time": "2025-01-16T09:15:00.000Z",
      "last_edited_time": "2025-02-04T16:45:00.000Z",
      "archived": false,
      "in_trash": false,
      "parent": {
        "type": "database_id",
        "database_id": "data-source-uuid"
      },
      "properties": {
        "Premier email": {
          "id": "YYfp",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "autre@exemple.fr",
                "link": null
              },
              "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
              },
              "plain_text": "autre@exemple.fr",
              "href": null
            }
          ]
        },
        "Status": {
          "id": "HOEP",
          "type": "select",
          "select": {
            "id": "opt-uuid-2",
            "name": "Terminé",
            "color": "green"
          }
        },
        "Température": {
          "id": "XaQp",
          "type": "number",
          "number": 18.3
        },
        "Date de contact": {
          "id": "BmZl",
          "type": "date",
          "date": {
            "start": "2025-01-25",
            "end": null
          }
        }
      },
      "url": "https://notion.so/page-uuid-2",
      "public_url": null
    }
  ],
  "next_cursor": "next-cursor-xyz",
  "has_more": true
}
```

**Taille**: ~3.5 KB pour 2 pages

---

## Option 1: Format 'summary' (Résumé Intelligent)

**Paramètre**: `_output: 'summary'`

```json
{
  "_format": "summary",
  "total": 2,
  "has_more": true,
  "results": [
    {
      "id": "page-uuid-1",
      "title": "contact@example.com",
      "properties": {
        "Premier email": "contact@example.com",
        "Status": "En cours",
        "Température": 22.5,
        "Date de contact": "2025-01-20"
      },
      "last_edited": "2025-02-05"
    },
    {
      "id": "page-uuid-2",
      "title": "autre@exemple.fr",
      "properties": {
        "Premier email": "autre@exemple.fr",
        "Status": "Terminé",
        "Température": 18.3,
        "Date de contact": "2025-01-25"
      },
      "last_edited": "2025-02-04"
    }
  ]
}
```

**Transformation appliquée**:
- ✅ Noms de propriétés lisibles (pas d'IDs comme "YYfp")
- ✅ Valeurs extraites des structures imbriquées (`rich_text[0].text.content` → valeur directe)
- ✅ Métadonnées réduites (plus de `archived`, `in_trash`, `url`, etc.)
- ✅ Taille réduite de ~70%

**Taille**: ~1 KB (-70%)

---

## Option 2: Format 'minimal' (Ultra-minimal)

**Paramètre**: `_output: 'minimal'`

```json
{
  "_format": "minimal",
  "count": 2,
  "items": [
    {
      "id": "page-uuid-1",
      "email": "contact@example.com",
      "status": "En cours"
    },
    {
      "id": "page-uuid-2",
      "email": "autre@exemple.fr",
      "status": "Terminé"
    }
  ]
}
```

**Transformation appliquée**:
- ✅ Uniquement les champs "critiques" (id + première propriété texte + select)
- ✅ Noms de champs courts et génériques
- ✅ Plus de métadonnées de pagination
- ✅ Taille réduite de ~90%

**Taille**: ~350 B (-90%)

---

## Option 3: Champs Spécifiques (Fields)

**Paramètre**: `_fields: ['id', 'Premier email', 'Status']`

```json
{
  "_format": "fields",
  "_fields": ["id", "Premier email", "Status"],
  "results": [
    {
      "id": "page-uuid-1",
      "Premier email": "contact@example.com",
      "Status": "En cours"
    },
    {
      "id": "page-uuid-2",
      "Premier email": "autre@exemple.fr",
      "Status": "Terminé"
    }
  ]
}
```

**Transformation appliquée**:
- ✅ Uniquement les champs demandés
- ✅ Valeurs extraites des structures imbriquées
- ✅ Noms de propriétés humains préservés
- ✅ Taille réduite de ~80%

**Taille**: ~700 B (-80%)

---

## Option 4: Format 'structured' (MCP 2025-06-18)

**Paramètre**: `_structured: true`

```json
{
  "content": [
    {
      "type": "text",
      "text": "2 pages trouvées: contact@example.com (En cours), autre@exemple.fr (Terminé)"
    }
  ],
  "structuredContent": {
    "total": 2,
    "pages": [
      {
        "id": "page-uuid-1",
        "email": "contact@example.com",
        "status": "En cours",
        "temperature": 22.5
      },
      {
        "id": "page-uuid-2",
        "email": "autre@exemple.fr",
        "status": "Terminé",
        "temperature": 18.3
      }
    ]
  },
  "isError": false
}
```

**Avantages**:
- ✅ Conforme à la spec MCP 2025-06-18
- ✅ `structuredContent` pour le parsing automatique
- ✅ `text` pour l'affichage humain
- ✅ Support de la validation par `outputSchema` (si ajouté)

---

## Comparaison des Tailles

| Format | Taille | Réduction | Cas d'usage |
|--------|--------|-----------|-------------|
| `full` (actuel) | 3.5 KB | - | Développement, debug |
| `summary` | 1 KB | -70% | Exploration, recherche |
| `minimal` | 350 B | -90% | Listes rapides, IDs |
| `fields` | 700 B | -80% | Champs spécifiques connus |
| `structured` | 1.2 KB | -65% | Clients MCP modernes |

---

## Exemples d'Utilisation

```typescript
// Client MCP actuel - format complet
await mcp.call('query-data-source', {
  data_source_id: 'xxx',
  filter: { property: 'Status', select: { equals: 'En cours' } }
})

// Format résumé
await mcp.call('query-data-source', {
  data_source_id: 'xxx',
  filter: { property: 'Status', select: { equals: 'En cours' } },
  _output: 'summary'
})

// Format minimal avec champs spécifiques
await mcp.call('query-data-source', {
  data_source_id: 'xxx',
  _output: 'minimal',
  _fields: ['id', 'Premier email']
})

// Format structuré (MCP 2025)
await mcp.call('query-data-source', {
  data_source_id: 'xxx',
  _structured: true,
  _output: 'summary'
})
```

---

## Implémentation Suggérée

```typescript
// src/openapi-mcp-server/mcp/transformer.ts

interface TransformOptions {
  format?: 'full' | 'summary' | 'minimal'
  fields?: string[]
  structured?: boolean
  operation?: string
}

export class ResponseTransformer {
  transform(data: any, options: TransformOptions): any {
    const { format, fields, structured, operation } = options

    let result: any

    if (fields && fields.length > 0) {
      result = this.extractFields(data, fields)
    } else if (format === 'minimal') {
      result = this.minimalFormat(data, operation)
    } else if (format === 'summary') {
      result = this.summaryFormat(data, operation)
    } else {
      result = data  // format 'full'
    }

    if (structured) {
      return {
        content: [{
          type: 'text',
          text: this.generateTextSummary(result)
        }],
        structuredContent: result
      }
    }

    return result
  }

  private summaryFormat(data: any, operation: string): any {
    if (data.object === 'list' && Array.isArray(data.results)) {
      return {
        _format: 'summary',
        total: data.results.length,
        has_more: data.has_more,
        results: data.results.map((item: any) => this.flattenPage(item))
      }
    }
    return this.flattenPage(data)
  }

  private minimalFormat(data: any, operation: string): any {
    if (data.object === 'list' && Array.isArray(data.results)) {
      return {
        _format: 'minimal',
        count: data.results.length,
        items: data.results.map((item: any) => this.extractEssential(item))
      }
    }
    return this.extractEssential(data)
  }

  private extractFields(data: any, fields: string[]): any {
    if (data.object === 'list' && Array.isArray(data.results)) {
      return {
        _format: 'fields',
        _fields: fields,
        results: data.results.map((item: any) =>
          Object.fromEntries(
            fields.map(f => [f, this.extractValue(item, f)])
          )
        )
      }
    }
    return Object.fromEntries(
      fields.map(f => [f, this.extractValue(data, f)])
    )
  }

  private flattenPage(page: any): any {
    const flat: any = {
      id: page.id,
      title: this.extractTitle(page),
      properties: {}
    }

    if (page.properties) {
      for (const [name, prop] of Object.entries(page.properties)) {
        flat.properties[name] = this.extractPropertyValue(prop)
      }
    }

    if (page.last_edited_time) {
      flat.last_edited = page.last_edited_time.split('T')[0]
    }

    return flat
  }

  private extractPropertyValue(prop: any): any {
    if (!prop || typeof prop !== 'object') return prop

    // rich_text → valeur
    if (prop.type === 'rich_text' && prop.rich_text?.[0]?.text?.content) {
      return prop.rich_text[0].text.content
    }

    // select → nom
    if (prop.type === 'select' && prop.select?.name) {
      return prop.select.name
    }

    // number → valeur
    if (prop.type === 'number' && prop.number !== null) {
      return prop.number
    }

    // date → start
    if (prop.type === 'date' && prop.date?.start) {
      return prop.date.start
    }

    // checkbox → boolean
    if (prop.type === 'checkbox') {
      return prop.checkbox
    }

    return prop
  }

  private extractTitle(page: any): string {
    // Chercher une propriété title ou la première propriété textuelle
    if (page.properties) {
      for (const [name, prop] of Object.entries(page.properties)) {
        const value = this.extractPropertyValue(prop)
        if (typeof value === 'string' && value.length > 0) {
          return value
        }
      }
    }
    return page.id
  }

  private extractEssential(page: any): any {
    return {
      id: page.id,
      email: this.extractTitle(page),
      status: this.extractStatus(page)
    }
  }

  private extractStatus(page: any): string | null {
    if (!page.properties) return null
    for (const prop of Object.values(page.properties)) {
      if (prop?.type === 'select' && prop.select?.name) {
        return prop.select.name
      }
    }
    return null
  }

  private extractValue(item: any, field: string): any {
    if (field === 'id') return item.id
    if (item.properties && item.properties[field]) {
      return this.extractPropertyValue(item.properties[field])
    }
    return null
  }

  private generateTextSummary(result: any): string {
    if (result.results) {
      const items = result.results.map((r: any) =>
        r.title || r.email || r.id
      ).join(', ')
      return `${result.total || result.count} items: ${items}`
    }
    return JSON.stringify(result)
  }
}
```

---

## Intégration dans proxy.ts

```typescript
// Dans proxy.ts
import { ResponseTransformer } from './transformer.js'

export class MCPProxy {
  private transformer: ResponseTransformer

  constructor(...) {
    // ...
    this.transformer = new ResponseTransformer()
  }

  // Dans CallToolRequestSchema handler
  const response = await this.httpClient.executeOperation(operation, deserializedParams)

  // Extraire les options de transformation
  const outputFormat = (deserializedParams as any)._output || 'full'
  const includeFields = (deserializedParams as any)._fields
  const structured = (deserializedParams as any)._structured || false

  // Transformer la réponse
  const transformedData = this.transformer.transform(response.data, {
    format: outputFormat,
    fields: includeFields,
    structured: structured,
    operation: operation.operationId
  })

  // Retourner selon le mode
  if (structured) {
    return transformedData  // Déjà au format MCP {content, structuredContent}
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(transformedData)
    }]
  }
}
```
