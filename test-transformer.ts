#!/usr/bin/env tsx

/**
 * Test script for ResponseTransformer
 *
 * Tests the transformation of various Notion property types and response structures.
 */

import { ResponseTransformer, type OutputMode } from './src/openapi-mcp-server/mcp/transformer.js'

// Test data representing typical Notion API responses
const testCases = {
  // Page response with nested properties
  pageResponse: {
    object: 'page',
    id: 'page-123',
    created_time: '2025-01-15T10:00:00.000Z',
    last_edited_time: '2025-01-15T10:00:00.000Z',
    archived: false,
    in_trash: false,
    url: 'https://notion.so/page-123',
    parent: {
      type: 'data_source_id',
      data_source_id: 'ds-123',
    },
    properties: {
      Name: {
        id: 'title-123',
        type: 'title',
        title: [
          {
            type: 'text',
            text: { content: 'My Page Title', link: null },
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
            plain_text: 'My Page Title',
            href: null,
          },
        ],
      },
      Status: {
        id: 'select-123',
        type: 'select',
        select: { id: 'opt-1', name: 'In Progress', color: 'blue' },
      },
      Tags: {
        id: 'multi-123',
        type: 'multi_select',
        multi_select: [
          { id: 'tag-1', name: 'Important', color: 'red' },
          { id: 'tag-2', name: 'Work', color: 'blue' },
        ],
      },
      DueDate: {
        id: 'date-123',
        type: 'date',
        date: { start: '2025-01-20', end: '2025-01-25' },
      },
      Priority: {
        id: 'num-123',
        type: 'number',
        number: 5,
      },
      Completed: {
        id: 'chk-123',
        type: 'checkbox',
        checkbox: true,
      },
      Website: {
        id: 'url-123',
        type: 'url',
        url: 'https://example.com',
      },
      Email: {
        id: 'email-123',
        type: 'email',
        email: 'user@example.com',
      },
      Attachments: {
        id: 'files-123',
        type: 'files',
        files: [
          {
            type: 'external',
            name: 'Document.pdf',
            external: { url: 'https://example.com/doc.pdf' },
          },
        ],
      },
      Assignees: {
        id: 'people-123',
        type: 'people',
        people: [
          { id: 'user-1', name: 'Alice', object: 'user' },
          { id: 'user-2', name: 'Bob', object: 'user' },
        ],
      },
      Related: {
        id: 'rel-123',
        type: 'relation',
        relation: ['page-456', 'page-789'],
      },
      Formula: {
        id: 'form-123',
        type: 'formula',
        formula: { type: 'string', string: 'Calculated value' },
      },
      Rollup: {
        id: 'roll-123',
        type: 'rollup',
        rollup: { type: 'number', number: 42 },
      },
      Created: {
        id: 'created-123',
        type: 'created_time',
        created_time: '2025-01-15T10:00:00.000Z',
      },
      Creator: {
        id: 'creator-123',
        type: 'created_by',
        created_by: { id: 'user-1', name: 'Alice' },
      },
      LastEdited: {
        id: 'edited-123',
        type: 'last_edited_time',
        last_edited_time: '2025-01-15T10:00:00.000Z',
      },
      Editor: {
        id: 'editor-123',
        type: 'last_edited_by',
        last_edited_by: { id: 'user-2', name: 'Bob' },
      },
      TaskStatus: {
        id: 'status-123',
        type: 'status',
        status: { id: 'st-1', name: 'Done', color: 'green' },
      },
      TaskID: {
        id: 'uid-123',
        type: 'unique_id',
        unique_id: { prefix: 'TASK', number: 12345 },
      },
    },
  },

  // Query response with pagination
  queryResponse: {
    object: 'list',
    results: [
      {
        object: 'page',
        id: 'page-1',
        created_time: '2025-01-15T10:00:00.000Z',
        last_edited_time: '2025-01-15T10:00:00.000Z',
        archived: false,
        in_trash: false,
        url: 'https://notion.so/page-1',
        properties: {
          Name: {
            type: 'title',
            title: [{ type: 'text', text: { content: 'First Item' } }],
          },
        },
      },
      {
        object: 'page',
        id: 'page-2',
        created_time: '2025-01-15T10:00:00.000Z',
        last_edited_time: '2025-01-15T10:00:00.000Z',
        archived: false,
        in_trash: false,
        url: 'https://notion.so/page-2',
        properties: {
          Name: {
            type: 'title',
            title: [{ type: 'text', text: { content: 'Second Item' } }],
          },
        },
      },
    ],
    next_cursor: 'next-123',
    has_more: true,
  },

  // Simple write response
  writeResponse: {
    object: 'page',
    id: 'page-created-123',
    created_time: '2025-01-15T10:00:00.000Z',
    last_edited_time: '2025-01-15T10:00:00.000Z',
    archived: false,
    url: 'https://notion.so/page-created-123',
  },
}

async function runTests() {
  console.log('='.repeat(60))
  console.log('ResponseTransformer Test Suite')
  console.log('='.repeat(60))
  console.log('')

  // Test 1: Full mode (should return unchanged)
  console.log('Test 1: Full mode (unchanged output)')
  console.log('-'.repeat(60))
  const transformerFull = new ResponseTransformer('full')
  const fullResult = transformerFull.transform(testCases.pageResponse)
  console.log('Mode: full')
  console.log('Properties keys:', Object.keys((fullResult as any).properties).length)
  console.log('Sample property (Name):', JSON.stringify((fullResult as any).properties.Name, null, 2))
  console.log('')

  // Test 2: Reduced mode
  console.log('Test 2: Reduced mode (extracted values)')
  console.log('-'.repeat(60))
  const transformerReduced = new ResponseTransformer('reduced')
  const reducedResult = transformerReduced.transform(testCases.pageResponse)
  console.log('Mode: reduced')
  console.log('Properties keys:', Object.keys((reducedResult as any).properties).length)
  console.log('Sample properties:')
  console.log('  Name:', JSON.stringify((reducedResult as any).properties.Name))
  console.log('  Status:', JSON.stringify((reducedResult as any).properties.Status))
  console.log('  Tags:', JSON.stringify((reducedResult as any).properties.Tags))
  console.log('  DueDate:', JSON.stringify((reducedResult as any).properties.DueDate))
  console.log('  Priority:', JSON.stringify((reducedResult as any).properties.Priority))
  console.log('  Attachments:', JSON.stringify((reducedResult as any).properties.Attachments))
  console.log('  TaskID:', JSON.stringify((reducedResult as any).properties.TaskID))
  console.log('')

  // Test 3: Reduced mode with field whitelist
  console.log('Test 3: Reduced mode with field whitelist')
  console.log('-'.repeat(60))
  const whitelistResult = transformerReduced.transform(testCases.pageResponse, {
    mode: 'reduced',
    fields: ['id', 'url', 'Name', 'Status', 'Priority'],
  })
  console.log('Mode: reduced with fields = ["id", "url", "Name", "Status", "Priority"]')
  console.log('Result keys:', Object.keys(whitelistResult as any))
  console.log('Full result:', JSON.stringify(whitelistResult, null, 2))
  console.log('')

  // Test 4: Success only mode
  console.log('Test 4: Success only mode')
  console.log('-'.repeat(60))
  const transformerSuccess = new ResponseTransformer('success_only')
  const successResult = transformerSuccess.transform(testCases.writeResponse)
  console.log('Mode: success_only')
  console.log('Result:', JSON.stringify(successResult, null, 2))
  console.log('')

  // Test 5: Query response transformation
  console.log('Test 5: Query response with pagination (reduced mode)')
  console.log('-'.repeat(60))
  const queryResult = transformerReduced.transform(testCases.queryResponse)
  console.log('Mode: reduced')
  console.log('Has metadata:', 'next_cursor' in (queryResult as any))
  console.log('Results count:', (queryResult as any).results?.length)
  console.log('First result properties:', JSON.stringify((queryResult as any).results?.[0]?.properties))
  console.log('')

  // Test 6: Environment variable configuration
  console.log('Test 6: Environment variable configuration')
  console.log('-'.repeat(60))
  const originalEnv = process.env.NOTION_MCP_OUTPUT_MODE
  process.env.NOTION_MCP_OUTPUT_MODE = 'reduced'
  const { createTransformerFromEnv: createFromEnv } = await import('./src/openapi-mcp-server/mcp/transformer.js')
  const envTransformer = createFromEnv()
  const envResult = envTransformer.transform(testCases.pageResponse)
  console.log('NOTION_MCP_OUTPUT_MODE = reduced')
  console.log('Default mode:', envTransformer.getDefaultMode())
  console.log('Sample property:', JSON.stringify((envResult as any).properties.Name))
  process.env.NOTION_MCP_OUTPUT_MODE = originalEnv
  console.log('')

  // Test 7: All property types
  console.log('Test 7: All property types extraction')
  console.log('-'.repeat(60))
  const props = (testCases.pageResponse as any).properties
  console.log('Property type coverage:')
  for (const [propName, propValue] of Object.entries(props)) {
    const extracted = transformerReduced.extractNotionValue(propValue as any)
    const typeName = (propValue as any).type
    console.log(`  ${propName.padEnd(15)} (${typeName.padEnd(15)}):`, JSON.stringify(extracted))
  }
  console.log('')

  console.log('='.repeat(60))
  console.log('All tests completed successfully!')
  console.log('='.repeat(60))
}

// Run the tests
runTests().catch(console.error)
