# Paramètres Manquants - Notion MCP Server

**Date d'analyse:** 2026-02-05
**Version API:** 2025-09-03

## Résumé Exécutif

✅ **Tous les 22 endpoints sont implémentés**

❌ **Certains paramètres sont manquants dans les schémas OpenAPI**

---

## Paramètres Manquants par Endpoint

### 1. POST /v1/pages (post-page)

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `template` | object | Non | Appliquer un template à la création (type: none/default/template_id) |
| `position` | object | Non | Contrôler la position de la page (type: after_block/page_start/page_end) |
| `content` | array | ⚠️ | Peut être un alias de `children` (à vérifier) |

**Note:** Le paramètre `template` est une fonctionnalité importante permettant d'appliquer des templates de data source lors de la création de pages.

---

### 2. PATCH /v1/blocks/{block_id} (update-a-block)

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `in_trash` | boolean | Non | Indique si le bloc est dans la corbeille |

**Actuellement dans le spec:** `type`, `archived`

---

### 3. POST /v1/data_sources (create-a-data-source)

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `icon` | object/null | Non | Icône de la data source |

**Actuellement dans le spec:** `parent`, `properties`, `title`

---

### 4. PATCH /v1/data_sources/{data_source_id} (update-a-data-source)

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `icon` | object/null | Non | Icône de la data source |
| `archived` | boolean | Non | Statut d'archivage |
| `in_trash` | boolean | Non | Indique si la data source est dans la corbeille |
| `parent` | object | Non | Déplacer vers une autre database |

**Actuellement dans le spec:** `title`, `properties`, `description`

**Note:** Le paramètre `description` dans notre spec pourrait ne pas être officiellement supporté.

---

### 5. PATCH /v1/pages/{page_id} (patch-page)

À vérifier avec la doc officielle (GET request a échoué).

---

### 6. PATCH /v1/blocks/{block_id}/children (patch-block-children)

À vérifier avec la doc officielle (GET request a échoué).

---

## Paramètres Probablement Complets

Les endpoints suivants semblent avoir tous leurs paramètres correctement définis:

- ✅ GET /v1/users (start_cursor, page_size)
- ✅ GET /v1/blocks/{block_id}/children (start_cursor, page_size)
- ✅ GET /v1/pages/{page_id} (filter_properties)
- ✅ GET /v1/pages/{page_id}/properties/{property_id} (start_cursor, page_size)
- ✅ GET /v1/comments (block_id, start_cursor, page_size)
- ✅ POST /v1/data_sources/{data_source_id}/query (filter_properties)
- ✅ GET /v1/data_sources/{data_source_id}/templates (start_cursor, page_size)

---

## Problèmes Connexes (Schémas Incomplets)

Selon `TO_FIX.md`:

1. **Types de blocs:** Seulement 2/31+ types définis dans les schémas
2. **Filtres query-data-source:** Schémas vides pour de nombreux types de propriétés
3. **Schémas de réponse:** Incomplets pour certains endpoints

Ces limitations affectent la validation mais pas l'appelabilité des endpoints.

---

## Recommandations

### Priorité Haute

1. **Ajouter `template` à post-page** - Fonctionnalité importante pour créer des pages avec templates
2. **Ajouter `position` à post-page** - Permet de contrôler la position des nouvelles pages
3. **Ajouter `in_trash` à update-a-block** - Permet de gérer la corbeille

### Priorité Moyenne

4. **Ajouter `icon` à create-a-data-source et update-a-data-source**
5. **Ajouter `archived` et `in_trash` à update-a-data-source**
6. **Ajouter `parent` à update-a-data-source** (pour déplacer)

### Priorité Basse

7. Vérifier si `content` est un alias valide de `children` dans post-page
8. Vérifier les paramètres manquants pour patch-page et patch-block-children

---

## Comment Ajouter Ces Paramètres

Pour ajouter un paramètre manquant:

1. Éditer `scripts/notion-openapi.json`
2. Trouver l'endpoint dans `paths`
3. Ajouter le paramètre dans `requestBody.content["application/json"].schema.properties`
4. Ajouter aux `required` si nécessaire
5. Exécuter `npm run build` pour régénérer les outils MCP

**Exemple pour ajouter `template` à post-page:**

```json
{
  "paths": {
    "/v1/pages": {
      "post": {
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "properties": {
                  "parent": {...},
                  "properties": {...},
                  "children": {...},
                  "icon": {...},
                  "cover": {...},
                  "template": {
                    "type": "object",
                    "description": "Template to apply to the new page",
                    "properties": {
                      "type": {
                        "type": "string",
                        "enum": ["none", "default", "template_id"]
                      },
                      "template_id": {
                        "type": "string",
                        "description": "ID of the template to apply"
                      }
                    }
                  },
                  "position": {
                    "type": "object",
                    "description": "Position of the new page in parent's children",
                    "properties": {
                      "type": {
                        "type": "string",
                        "enum": ["after_block", "page_start", "page_end"]
                      },
                      "after_block": {
                        "type": "object",
                        "properties": {
                          "id": {"type": "string"}
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## Sources

- [Notion API Reference - Create a Page](https://developers.notion.com/reference/post-page)
- [Notion API Reference - Update a Block](https://developers.notion.com/reference/update-a-block)
- [Notion API Reference - Create a Data Source](https://developers.notion.com/reference/create-a-data-source)
- [Notion API Reference - Update a Data Source](https://developers.notion.com/reference/update-a-data-source)
- [Creating Pages from Templates](https://developers.notion.com/guides/data-apis/creating-pages-from-templates)
