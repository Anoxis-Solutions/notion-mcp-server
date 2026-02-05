# Plan d'amélioration des fonctionnalités Database/Data Source

## État actuel constaté

### Endpoints disponibles (API v2025-09-03)
- ✅ `POST /v1/data_sources/{id}/query` - Query une database
- ✅ `GET /v1/data_sources/{id}` - Récupérer metadata et schéma
- ✅ `PATCH /v1/data_sources/{id}` - Modifier les propriétés
- ✅ `POST /v1/data_sources` - Créer une nouvelle database
- ✅ `GET /v1/data_sources/{id}/templates` - Lister les templates

### Problèmes critiques identifiés

#### 1. Filter schema complètement vide (Ligne 2808-2810)
```json
"filter": {
  "type": "object",
  "description": "Filter conditions for querying the data source"
  // ❌ AUCUNE STRUCTURE DÉFINIE
}
```

**Impact** : L'IA ne peut PAS construire de requêtes avec filtres. C'est IMPOSSIBLE de faire:
- "Trouve les tâches où Status = 'En cours'"
- "Liste les projets avec Priorité > 3"
- "Montre-moi les pages créées cette semaine"

#### 2. Response schemas tous vides
```json
"200": {
  "schema": {
    "type": "object"  // ❌ VIDE - Pas de propriétés
  }
}
```

**Impact** : L'IA ne peut pas interpréter les réponses:
- Ne sait pas que `results` contient les données
- Ne connaît pas la structure de pagination (`next_cursor`, `has_more`)
- Ne peut pas lire le schéma des propriétés de la database

#### 3. Property types non documentés
18 types de propriétés existent dans l'API Notion mais aucun schéma n'est défini pour:
- title, rich_text, number, select, multi_select, date, people, files, checkbox, url, email, phone, formula, relation, rollup, created_time, created_by, last_edited_time, last_edited_by

**Impact** : Créer/modifier une database est quasiment impossible.

---

## Améliorations possibles (classées par priorité et faisabilité)

### P0 - CRITIQUE (Bloque l'utilisation des databases)

#### 1. Définir le schéma de filter complet
**Complexité** : Moyenne (environ 200-300 lignes)
**Impact** : ÉNORME - Rend les databases utilisables

**Structure à implémenter** (selon spec Notion API):

```json
"filter": {
  "oneOf": [
    {
      "type": "object",
      "description": "Single condition filter",
      "required": ["property"],
      "properties": {
        "property": {"type": "string"},
        "text": {"$ref": "#/components/schemas/textFilter"},
        "number": {"$ref": "#/components/schemas/numberFilter"},
        "checkbox": {"$ref": "#/components/schemas/checkboxFilter"},
        "select": {"$ref": "#/components/schemas/selectFilter"},
        "multi_select": {"$ref": "#/components/schemas/multiSelectFilter"},
        "date": {"$ref": "#/components/schemas/dateFilter"},
        "people": {"$ref": "#/components/schemas/peopleFilter"},
        "files": {"$ref": "#/components/schemas/filesFilter"},
        "relation": {"$ref": "#/components/schemas/relationFilter"}
      }
    },
    {
      "type": "object",
      "description": "Compound filter (AND/OR)",
      "properties": {
        "or": {
          "type": "array",
          "items": {"$ref": "#/components/schemas/compoundFilter"}
        },
        "and": {
          "type": "array",
          "items": {"$ref": "#/components/schemas/compoundFilter"}
        }
      }
    }
  ]
}
```

**Sous-schémas de filtres à créer** (par type de propriété):

| Type | Opérateurs | Complexité |
|------|-----------|------------|
| text | equals, contains, starts_with, ends_with, is_empty, is_not_empty | Faible |
| number | equals, does_not_equal, greater_than, less_than, greater_than_or_equal_to, less_than_or_equal_to, is_empty, is_not_empty | Faible |
| checkbox | equals, does_not_equal | Très faible |
| select | equals, does_not_equal, is_empty, is_not_empty | Faible |
| multi_select | contains, does_not_contain, is_empty, is_not_empty | Faible |
| date | equals, before, after, on_or_before, on_or_after, past_week, past_month, past_year, next_week, next_month, next_year, is_empty, is_not_empty | Moyenne |
| people | contains, does_not_contain, is_empty, is_not_empty | Faible |
| files | is_empty, is_not_empty | Très faible |
| relation | contains, does_not_contain, is_empty, is_not_empty | Faible |

#### 2. Définir les response schemas
**Complexité** : Faible (environ 100 lignes)
**Impact** : ÉNORME - L'IA peut interpréter les résultats

**À ajouter**:

```json
// Pour query-data-source
"responses": {
  "200": {
    "schema": {
      "type": "object",
      "properties": {
        "object": {"type": "string", "enum": ["list"]},
        "results": {
          "type": "array",
          "items": {"$ref": "#/components/schemas/pageObject"}
        },
        "next_cursor": {"type": "string"},
        "has_more": {"type": "boolean"}
      }
    }
  }
}

// Pour retrieve-a-data-source
"responses": {
  "200": {
    "schema": {
      "type": "object",
      "properties": {
        "object": {"type": "string", "enum": ["data_source"]},
        "id": {"type": "string"},
        "title": {"type": "array", "items": {"$ref": "#/components/schemas/richTextRequest"}},
        "description": {"type": "array", "items": {"$ref": "#/components/schemas/richTextRequest"}},
        "properties": {
          "type": "object",
          "additionalProperties": {"$ref": "#/components/schemas/propertySchema"}
        }
      }
    }
  }
}
```

### P1 - MAJEUR (Améliore significativement l'UX)

#### 3. Définir les property schemas pour création/modification
**Complexité** : Élevée (environ 300-400 lignes)
**Impact** : Permet de créer des databases avec des propriétés typées

**18 types de propriétés à définir**:

```json
"propertySchema": {
  "oneOf": [
    {"$ref": "#/components/schemas/titleProperty"},
    {"$ref": "#/components/schemas/richTextProperty"},
    {"$ref": "#/components/schemas/numberProperty"},
    {"$ref": "#/components/schemas/selectProperty"},
    {"$ref": "#/components/schemas/multiSelectProperty"},
    {"$ref": "#/components/schemas/dateProperty"},
    {"$ref": "#/components/schemas/peopleProperty"},
    {"$ref": "#/components/schemas/filesProperty"},
    {"$ref": "#/components/schemas/checkboxProperty"},
    {"$ref": "#/components/schemas/urlProperty"},
    {"$ref": "#/components/schemas/emailProperty"},
    {"$ref": "#/components/schemas/phoneProperty"},
    {"$ref": "#/components/schemas/formulaProperty"},
    {"$ref": "#/components/schemas/relationProperty"},
    {"$ref": "#/components/schemas/rollupProperty"},
    {"$ref": "#/components/schemas/createdTimeProperty"},
    {"$ref": "#/components/schemas/createdByProperty"},
    {"$ref": "#/components/schemas/lastEditedTimeProperty"},
    {"$ref": "#/components/schemas/lastEditedByProperty"}
  ]
}
```

#### 4. Définir pageObject pour les résultats de query
**Complexité** : Moyenne (environ 150 lignes)
**Impact** : Permet à l'IA de comprendre la structure des pages retournées

### P2 - MODÉRÉ (Fonctionnalités utiles mais pas bloquantes)

#### 5. Améliorer sortObject avec les conditions de timestamp
**Complexité** : Faible (environ 20 lignes)
**Impact** : Permet de trier par date de création/modification

```json
"sortObject": {
  "properties": {
    "property": {"type": "string"},
    "direction": {"enum": ["ascending", "descending"]},
    "timestamp": {
      "enum": ["created_time", "last_edited_time"],
      "description": "Use this instead of 'property' to sort by timestamp"
    }
  }
}
```

#### 6. Définir les schémas de templates
**Complexité** : Moyenne (environ 100 lignes)
**Impact** : Permet de créer des pages depuis des templates

### P3 - FAIBLE (Améliorations futures, hors du périmètre API actuel)

#### 7. Bulk operations
**Note** : L'API Notion n'a PAS d'endpoint bulk create. C'est une limitation de l'API, pas du MCP.

**Solution de contournement possible** : Créer un helper MCP qui fait une boucle d'appels, mais c'est au niveau code (pas dans l'OpenAPI spec).

#### 8. Pagination helpers
**Note** : À implémenter dans le code TypeScript, pas dans l'OpenAPI spec.

---

## Recommandation d'implémentation

### Phase 1 - P0 (Fondation bloquante)
1. **Filter schemas** (text, number, checkbox, select, multi_select, date, people, files, relation)
2. **Compound filter** (AND/OR)
3. **Response schemas** (query et retrieve)

**Estimation** : 300-400 lignes à ajouter
**Résultat** : L'IA peut enfin interagir intelligemment avec les databases

### Phase 2 - P1 (Création de databases)
4. **Property schemas** (les 18 types)
5. **pageObject** pour les résultats

**Estimation** : 500-600 lignes
**Résultat** : L'IA peut créer et structurer des databases complètes

### Phase 3 - P2 (Améliorations)
6. **sortObject amélioré**
7. **Template schemas**

**Estimation** : 150 lignes
**Résultat** : UX plus fluide

---

## Fichier à modifier

**UNIQUEMENT** : `scripts/notion-openapi.json`

Aucun changement TypeScript nécessaire - les outils sont auto-générés depuis la spec.

---

## Exemples d'usage après améliorations

### Avant (IMPOSSIBLE):
```
User: "Trouve les tâches en cours"
IA: ❌ Ne peut pas construire le filter - schema vide
```

### Après (P0):
```
User: "Trouve les tâches en cours"
IA: ✅ Appelle query-data-source avec:
{
  "filter": {
    "property": "Status",
    "select": {"equals": "En cours"}
  }
}
```

### Après (P0 + P1):
```
User: "Crée une database de suivi de projet"
IA: ✅ Appelle create-a-data-source avec:
{
  "title": "Suivi de projet",
  "properties": {
    "Nom": {"type": "title"},
    "Statut": {"type": "select", "options": ["À faire", "En cours", "Terminé"]},
    "Priorité": {"type": "number"},
    "Assigné à": {"type": "people"},
    "Date limite": {"type": "date"}
  }
}
```

---

## Prochaine action recommandée

Je propose de commencer par la **Phase 1 - P0** qui est le véritable blocage pour l'utilisation des databases.

Voulez-vous que je lance une tâche autonome pour:
1. Implémenter les filter schemas complets (9 types de propriétés)
2. Ajouter le compound filter (AND/OR)
3. Définir les response schemas pour query et retrieve

C'est environ 300-400 lignes à ajouter dans `scripts/notion-openapi.json`, et ça débloquerait complètement l'usage des databases par l'IA.
