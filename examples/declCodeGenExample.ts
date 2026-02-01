/// <reference types="node" />

/**
 * Simple CLI test for declCodeGenerator
 * 
 * Usage:
 *   npx tsx examples/test-decl-generator.ts "your prompt here"
 *   or
 *   npm run test:decl "your prompt here"
 * 
 * Loads environment variables from .env.local if it exists
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getAllComponentDefinitions } from '../src/components/decl'
import { getAllActionDefinitions } from '../src/services/actions'
import { generate } from '../src/services/decl'

// Default prompt for testing
const DEFAULT_PROMPT = 'Create a contact form with name, email, and message fields'

/**
 * Load environment variables from .env.local file
 */
function loadEnvLocal() {
  const envPath = join(process.cwd(), '.env.local')
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8')
    const lines = envContent.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue
      
      // Parse KEY=VALUE format
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        
        // Only set if not already in process.env
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
    console.log('Loaded environment variables from .env.local')
  }
}

async function main() {
  // Load .env.local first
  loadEnvLocal()
  
  // Check for API key
  if (!process.env.VITE_OPENAI_API_KEY) {
    console.error('Error: VITE_OPENAI_API_KEY environment variable is required')
    console.error('Set it in .env.local or export it before running:')
    console.error('  export VITE_OPENAI_API_KEY=your-key-here')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const prompt = args.length > 0 ? args.join(' ') : DEFAULT_PROMPT
  
  if (args.length === 0) {
    console.log(`No prompt provided, using default: "${DEFAULT_PROMPT}"`)
    console.log('(You can provide a custom prompt as an argument)\n')
  }
  console.log('Prompt:', prompt)
  console.log('Generating DECL structure...\n')

  try {
    const result = await generate(prompt, {
      componentDefinitions: getAllComponentDefinitions(true),
      actionDefinitions: getAllActionDefinitions(true),
      onUpdate: (spec) => {
        process.stdout.write(`\rView nodes: ${spec.view.length}, Data keys: ${Object.keys(spec.data).length}   `)
      }
    })

    // Validate structure (result is DeclSpec { view, data })
    console.log('\n\nValidation:')
    console.log(`✓ View nodes: ${result.view.length}`)
    console.log(`✓ Data keys: ${Object.keys(result.data).length}`)

    if (result.view.length > 0) {
      const rootElement = result.view[0]
      console.log(`✓ Root element key: ${rootElement.key}`)
      console.log(`✓ Root element type: ${rootElement.type}`)
      if (rootElement.children) {
        console.log(`✓ Root has ${rootElement.children.length} children`)
      }
    }

    console.log('\n✓ Success!')
  } catch (error: any) {
    console.error('\n✗ Error:', error.message)
    if (error.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
