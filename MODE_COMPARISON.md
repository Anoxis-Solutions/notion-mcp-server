# Comparaison des Modes : Full vs Smart vs Minimal

## Votre Requête Actuelle

```bash
API-query-data-source {"filter":{"and":[{"property":"NOM","rich_text":{"equals":"Solo"}}]},"data_source_id":"b238891d-a864-47cb-b399-ea398e0eff69","page_size":10}
```

---

## MODE FULL (actuel - comportement par défaut)

**Ce qui est affiché : TOUT**

```json
{
  "object": "list",
  "results": [
    {
      "object": "page",
      "id": "2fe2b0a4-6124-81b8-ae65-cc5eb4771c89",
      "created_time": "2026-02-05T14:32:00.000Z",
      "last_edited_time": "2026-02-05T14:32:00.000Z",
      "created_by": {
        "object": "user",
        "id": "4ac93a83-f33c-414d-a3d8-9489d079fc2e"
      },
      "last_edited_by": {
        "object": "user",
        "id": "4ac93a83-f33c-414d-a3d8-9489d079fc2e"
      },
      "cover": null,
      "icon": null,
      "parent": {
        "type": "data_source_id",
        "data_source_id": "b238891d-a864-47cb-b399-ea398e0eff69",
        "database_id": "ad0ae796-a03f-4e33-8a51-cefdf3a7f0ad"
      },
      "archived": false,
      "in_trash": false,
      "is_locked": false,
      "properties": {
        "`Homeworld`": {
          "id": "%3E%3E%5EP",
          "type": "rich_text",
          "rich_text": []
        },
        "`Force Sensitive`": {
          "id": "%40l~%3F",
          "type": "checkbox",
          "checkbox": false
        },
        "Species": {
          "id": "Ajut",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "Human",
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
              "plain_text": "Human",
              "href": null
            }
          ]
        },
        "PRENOM": {
          "id": "CjG%3D",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "Han",
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
              "plain_text": "Han",
              "href": null
            }
          ]
        },
        "`Wiki URL`": {
          "id": "EbTX",
          "type": "url",
          "url": null
        },
        "Affiliation": {
          "id": "FuvB",
          "type": "multi_select",
          "multi_select": [
            {
              "id": "41c34389-c3dc-4ea2-af63-3bd6742508be",
              "name": "Rebel Alliance",
              "color": "purple"
            },
            {
              "id": "90c6af38-1cda-4543-8df2-b2d1de6dcc31",
              "name": "Outer Rim",
              "color": "red"
            }
          ]
        },
        "`Quote`": {
          "id": "S%3AhH",
          "type": "rich_text",
          "rich_text": []
        },
        "`Species`": {
          "id": "%5CsFJ",
          "type": "rich_text",
          "rich_text": []
        },
        "Homeworld": {
          "id": "dru%3F",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "Corellia",
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
              "plain_text": "Corellia",
              "href": null
            }
          ]
        },
        "Character Type": {
          "id": "fA%40G",
          "type": "select",
          "select": null
        },
        "Status": {
          "id": "sQZ%3D",
          "type": "select",
          "select": null
        },
        "Birth Date": {
          "id": "ybZ%7D",
          "type": "date",
          "date": null
        },
        "NOM": {
          "id": "title",
          "type": "title",
          "title": [
            {
              "type": "text",
              "text": {
                "content": "Solo",
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
              "plain_text": "Solo",
              "href": null
            }
          ]
        }
      },
      "url": "https://www.notion.so/Solo-2fe2b0a4612481b8ae65cc5eb4771c89",
      "public_url": null
    },
    // ... deuxième entrée Han Solo ...
  ],
  "next_cursor": null,
  "has_more": false,
  "type": "page_or_data_source",
  "page_or_data_source": {},
  "request_id": "1564e377-7ec5-4a31-ba91-afda0fd46b52"
}
```

**Taille** : ~8 000 caractères
**Ce qui'est inclus** :
- ✅ Toutes les métadonnées (created_time, last_edited_time, created_by, etc.)
- ✅ Toutes les propriétés avec leurs IDs techniques (CjG%3D, Ajut, etc.)
- ✅ Structures complètes (rich_text[0].text.content, annotations, etc.)
- ✅ Propriétés vides ([] ou null)

---

## MODE SMART (recommandé comme défaut)

**Ce qui est affiché : Les données utiles, aplaties**

```json
{
  "_mode": "smart",
  "total": 2,
  "results": [
    {
      "id": "2fe2b0a4-6124-81b8-ae65-cc5eb4771c89",
      "title": "Solo",
      "properties": {
        "PRENOM": "Han",
        "NOM": "Solo",
        "Species": "Human",
        "Homeworld": "Corellia",
        "Affiliation": ["Rebel Alliance", "Outer Rim"],
        "Quote": null,
        "Character Type": null,
        "Status": null,
        "Birth Date": null,
        "`Force Sensitive`": false,
        "`Wiki URL`": null
      },
      "url": "https://www.notion.so/Solo-2fe2b0a4612481b8ae65cc5eb4771c89"
    },
    {
      "id": "2fe2b0a4-6124-81d6-ac2f-e41d2268bbdc",
      "title": "Solo",
      "properties": {
        "PRENOM": "Han",
        "NOM": "Solo",
        "Species": "Human",
        "Homeworld": "Corellia",
        "Affiliation": ["Rebel Alliance", "Outer Rim"],
        "Quote": "Never tell me the odds!",
        "Character Type": null,
        "Status": null,
        "Birth Date": null,
        "`Force Sensitive`": false,
        "`Wiki URL`": "https://starwars.fandom.com/wiki/Han_Solo"
      },
      "url": "https://www.notion.so/Solo-2fe2b0a4612481d6ac2fe41d2268bbdc"
    }
  ]
}
```

**Taille** : ~800 caractères (-90%)

**Ce qui'est inclus** :
- ✅ ID et titre
- ✅ Toutes les propriétés avec leurs **valeurs extraites** (pas de structures imbriquées)
- ✅ URL Notion
- ✅ Valeurs null pour les champs vides

**Ce qui'est retiré** :
- ❌ Métadonnées techniques (created_time, created_by, archived, etc.)
- ❌ IDs de propriétés (CjG%3D, Ajut, etc.)
- ❌ Structures imbriquées (rich_text[0].text.content → "Han")
- ❌ Propriétés vides ([])

---

## MODE MINIMAL (ultra léger)

**Ce qui est affiché : L'essentiel**

```json
{
  "_mode": "minimal",
  "count": 2,
  "items": [
    {
      "id": "2fe2b0a4-6124-81b8-ae65-cc5eb4771c89",
      "title": "Solo",
      "key_data": {
        "name": "Han Solo",
        "species": "Human",
        "homeworld": "Corellia"
      }
    },
    {
      "id": "2fe2b0a4-6124-81d6-ac2f-e41d2268bbdc",
      "title": "Solo",
      "key_data": {
        "name": "Han Solo",
        "species": "Human",
        "homeworld": "Corellia",
        "quote": "Never tell me the odds!"
      }
    }
  ]
}
```

**Taille** : ~400 caractères (-95%)

**Ce qui'est inclus** :
- ✅ ID
- ✅ Titre
- ✅ Quelques champs clés extraits automatiquement

**Ce qui'est retiré** :
- ❌ Toutes les métadonnées
- ❌ URL
- ❌ Propriétés null/vides
- ❌ Propriétés secondaires

---

## TABLEAU COMPARATIF

| Champ | FULL | SMART | MINIMAL |
|-------|------|-------|---------|
| `object` | ✅ "list" | ❌ | ❌ |
| `results[n].object` | ✅ "page" | ❌ | ❌ |
| `results[n].id` | ✅ | ✅ | ✅ |
| `results[n].created_time` | ✅ "2026-02-05..." | ❌ | ❌ |
| `results[n].last_edited_time` | ✅ | ❌ | ❌ |
| `results[n].created_by` | ✅ {object, id} | ❌ | ❌ |
| `results[n].cover` | ✅ null | ❌ | ❌ |
| `results[n].archived` | ✅ false | ❌ | ❌ |
| `results[n].properties.PRENOM.id` | ✅ "CjG%3D" | ❌ | ❌ |
| `results[n].properties.PRENOM.type` | ✅ "rich_text" | ❌ | ❌ |
| `results[n].properties.PRENOM.rich_text[0]` | ✅ {annotations, ...} | ❌ | ❌ |
| `properties.PRENOM` (valeur) | ❌ imbriqué | ✅ "Han" | ✅ "Han" |
| `properties.Affiliation` (valeurs) | ❌ [{id, name, color}] | ✅ ["Rebel Alliance"] | ✅ "Rebel Alliance" |
| `properties.Quote` (vide) | ✅ rich_text:[] | ✅ null | ❌ |
| `url` | ✅ | ✅ | ❌ |
| `next_cursor` | ✅ | ❌ | ❌ |
| `has_more` | ✅ false | ❌ | ❌ |
| `request_id` | ✅ | ❌ | ❌ |
| **Taille** | ~8 000 chars | ~800 chars | ~400 chars |

---

## COMMENT L'UTILISER

```bash
# Mode SMART (recommandé comme défaut futur)
export NOTION_MCP_OUTPUT_MODE="smart"

# Ou par requête
API-query-data-source {
  "filter": {...},
  "data_source_id": "...",
  "_output": "smart"     # ← Nouveau paramètre
}

# Mode MINIMAL
API-query-data-source {
  "filter": {...},
  "data_source_id": "...",
  "_output": "minimal"   # ← Ultra léger
}

# Mode FULL (comportement actuel, rétrocompatible)
API-query-data-source {
  "filter": {...},
  "data_source_id": "...",
  "_output": "full"      # ← Tout (défaut actuel)
}
```

---

## POURQUOI SMART EST LE MEILLEUR DÉFAUT

**Full** : Trop verbeux pour l'AI, gaspille du contexte
**Minimal** : Trop limité, on perd des données utiles
**Smart** :
- ✅ Garde toutes les propriétés avec leurs valeurs
- ✅ Aplati les structures (pas de rich_text[0].text.content)
- ✅ Enlève les métadonnées techniques inutiles
- ✅ Réduit de 90% la taille
- ✅ L'AI a accès à toutes les données importantes
