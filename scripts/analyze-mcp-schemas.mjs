#!/usr/bin/env node

/**
 * Analyze actual MCP tool schemas to see which $defs each tool uses
 * This analyzes the CONVERTED schemas, not the raw OpenAPI
 */

import { readFileSync } from 'fs'
import { OpenAPIToMCPConverter } from '../src/openapi-mcp-server/openapi/parser.ts'

const openapi = JSON.parse(readFileSync('./scripts/notion-openapi.json', 'utf-8'))

const converter = new OpenAPIToMCPConverter(openapi)
const result = converter.convertToMCPTools()

// Flatten the tools structure
const tools = []
for (const [category, { methods }] of Object.entries(result.tools)) {
  tools.push(...methods)
}

// Extract all component schemas
const allSchemas = Object.keys(openapi.components?.schemas || {})
console.log(`\n📦 Total schemas in OpenAPI spec: ${allSchemas.length}`)

// Collect all $refs from a JSON schema (after conversion)
// BUT skip the $defs section itself - we want what's actually USED
function collectRefsFromJsonSchema(schema, refs = new Set(), skipDefs = false) {
  if (!schema || typeof schema !== 'object') return refs

  // Skip $defs when collecting (we know they're there, we want what REFERENCES them)
  if (skipDefs && schema.$defs) {
    // Don't traverse into $defs, just collect refs from other parts
  }

  if (schema.$ref) {
    // Extract the def name from #/$defs/xxx
    const match = schema.$ref.match(/#\/\$defs\/(.+)$/)
    if (match) {
      refs.add(match[1])
    }
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === '$defs' && skipDefs) continue
    if (key === '$ref') continue
    if (Array.isArray(value)) {
      value.forEach(item => collectRefsFromJsonSchema(item, refs, skipDefs))
    } else if (typeof value === 'object' && value !== null) {
      collectRefsFromJsonSchema(value, refs, skipDefs)
    }
  }

  return refs
}

console.log('\n📊 Actual $defs usage in MCP tool schemas:\n')

const toolUsage = []
for (const tool of tools) {
  // skipDefs=true to NOT count schemas in $defs themselves, only what's actually referenced
  const inputRefs = collectRefsFromJsonSchema(tool.inputSchema, new Set(), true)
  const outputRefs = tool.returnSchema ? collectRefsFromJsonSchema(tool.returnSchema, new Set(), true) : new Set()
  const allRefs = new Set([...inputRefs, ...outputRefs])

  toolUsage.push({
    name: tool.name,
    inputCount: inputRefs.size,
    outputCount: outputRefs.size,
    totalCount: allRefs.size,
    schemas: Array.from(allRefs).sort()
  })
}

toolUsage.sort((a, b) => a.totalCount - b.totalCount)

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
  const bar = '█'.repeat(Math.ceil(tool.totalCount / 3)) || '░'
  console.log(`${bar} ${tool.name}`)
  console.log(`   Input: ${tool.inputCount} | Output: ${tool.outputCount} | Total: ${tool.totalCount}`)
  if (tool.schemas.length > 0 && tool.schemas.length <= 10) {
    console.log(`   Schemas: ${tool.schemas.join(', ')}`)
  } else if (tool.schemas.length > 10) {
    console.log(`   Schemas: ${tool.schemas.slice(0, 10).join(', ')}... (+${tool.schemas.length - 10})`)
  }
  console.log()

  stats.avgUsage += tool.totalCount
  stats.minUsage = Math.min(stats.minUsage, tool.totalCount)
  stats.maxUsage = Math.max(stats.maxUsage, tool.totalCount)

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
console.log(`   Unused schemas: ${stats.unusedSchemas.size}`)
if (stats.unusedSchemas.size > 0 && stats.unusedSchemas.size < 30) {
  console.log(`   Unused: ${Array.from(stats.unusedSchemas).join(', ')}`)
}

// Calculate potential savings with more accurate numbers
// Current state: every tool has ALL schemas in $defs
const toolsWithOutput = toolUsage.filter(t => t.outputCount > 0).length
const currentInputDefs = stats.tools * stats.totalSchemas
const currentOutputDefs = toolsWithOutput * stats.totalSchemas
const currentTotal = currentInputDefs + currentOutputDefs

const optimizedInputDefs = toolUsage.reduce((sum, tool) => sum + tool.inputCount, 0)
const optimizedOutputDefs = toolUsage.reduce((sum, tool) => sum + tool.outputCount, 0)
const optimizedTotal = optimizedInputDefs + optimizedOutputDefs

const savings = ((1 - optimizedTotal / currentTotal) * 100).toFixed(1)

console.log(`\n💰 Potential savings:`)
console.log(`   Current: ${currentTotal} schema copies (${currentInputDefs} input + ${currentOutputDefs} output)`)
console.log(`   Optimized: ${optimizedTotal} schema copies (${optimizedInputDefs} input + ${optimizedOutputDefs} output)`)
console.log(`   Reduction: ${savings}%`)

// Show which tools have the most to gain
console.log(`\n🎯 Top tools that would benefit most:`)
const topBeneficiaries = toolUsage
  .map(t => ({
    ...t,
    waste: stats.totalSchemas - t.totalCount
  }))
  .sort((a, b) => b.waste - a.waste)
  .slice(0, 5)

for (const tool of topBeneficiaries) {
  console.log(`   ${tool.name}: wastes ${tool.waste} unused schemas (${((tool.waste / stats.totalSchemas) * 100).toFixed(0)}%)`)
}
