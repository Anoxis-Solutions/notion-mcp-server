#!/usr/bin/env node

/**
 * Analyze which $defs are actually used by each tool
 * Goal: Identify how much we can save by only including used schemas
 */

import { readFileSync } from 'fs'

const openapi = JSON.parse(readFileSync('./scripts/notion-openapi.json', 'utf-8'))

// Extract all component schemas
const allSchemas = Object.keys(openapi.components?.schemas || {})
console.log(`\n📦 Total schemas in OpenAPI spec: ${allSchemas.length}`)
console.log(`   ${allSchemas.join(', ')}\n`)

// Collect all refs from a schema object
function collectRefs(schema, refs = new Set()) {
  if (!schema || typeof schema !== 'object') return refs

  if (schema.$ref) {
    const refName = schema.$ref.replace('#/components/schemas/', '')
    refs.add(refName)
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === '$ref') continue
    if (Array.isArray(value)) {
      value.forEach(item => collectRefs(item, refs))
    } else if (typeof value === 'object' && value !== null) {
      collectRefs(value, refs)
    }
  }

  return refs
}

// Analyze each operation
const toolUsage = []

for (const [path, methods] of Object.entries(openapi.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    if (!operation.operationId) continue

    const usedSchemas = new Set()

    // Check parameters
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if (param.schema) {
          collectRefs(param.schema, usedSchemas)
        }
      }
    }

    // Check requestBody
    if (operation.requestBody?.content) {
      for (const content of Object.values(operation.requestBody.content)) {
        if (content.schema) {
          collectRefs(content.schema, usedSchemas)
        }
      }
    }

    // Check responses
    if (operation.responses) {
      for (const [code, response] of Object.entries(operation.responses)) {
        if (response.content?.['application/json']?.schema) {
          collectRefs(response.content['application/json'].schema, usedSchemas)
        }
      }
    }

    toolUsage.push({
      operationId: operation.operationId,
      path,
      method,
      schemas: Array.from(usedSchemas).sort(),
      count: usedSchemas.size
    })
  }
}

// Sort by operationId
toolUsage.sort((a, b) => a.operationId.localeCompare(b.operationId))

console.log('📊 Schema usage by tool:\n')

// Statistics
const stats = {
  tools: toolUsage.length,
  totalSchemas: allSchemas.length,
  avgUsage: 0,
  minUsage: Infinity,
  maxUsage: 0,
  unusedSchemas: new Set(allSchemas)
}

for (const tool of toolUsage) {
  const bar = '█'.repeat(Math.ceil(tool.count / 2)) || '░'
  console.log(`${bar} ${tool.operationId}`)
  console.log(`   ${tool.count} schemas: ${tool.schemas.slice(0, 5).join(', ')}${tool.schemas.length > 5 ? '...' : ''}`)
  console.log()

  stats.avgUsage += tool.count
  stats.minUsage = Math.min(stats.minUsage, tool.count)
  stats.maxUsage = Math.max(stats.maxUsage, tool.count)

  // Track used schemas
  for (const schema of tool.schemas) {
    stats.unusedSchemas.delete(schema)
  }
}

stats.avgUsage = (stats.avgUsage / stats.tools).toFixed(1)

console.log('📈 Summary:')
console.log(`   Tools analyzed: ${stats.tools}`)
console.log(`   Total schemas available: ${stats.totalSchemas}`)
console.log(`   Average schemas per tool: ${stats.avgUsage}`)
console.log(`   Min schemas used: ${stats.minUsage}`)
console.log(`   Max schemas used: ${stats.maxUsage}`)
console.log(`   Potentially unused schemas: ${stats.unusedSchemas.size}`)
if (stats.unusedSchemas.size > 0) {
  console.log(`   Unused: ${Array.from(stats.unusedSchemas).join(', ')}`)
}

// Calculate potential savings
const currentTotal = stats.tools * stats.totalSchemas * 2 // input + output
const optimizedTotal = toolUsage.reduce((sum, tool) => sum + tool.count * 2, 0)
const savings = ((1 - optimizedTotal / currentTotal) * 100).toFixed(1)

console.log(`\n💰 Potential savings:`)
console.log(`   Current: ${stats.tools} tools × ${stats.totalSchemas} schemas × 2 (input/output) = ${currentTotal} schema copies`)
console.log(`   Optimized: ${optimizedTotal} schema copies (only what's used)`)
console.log(`   Reduction: ${savings}%`)
