/**
 * GenUI Service
 * 
 * This service generates React components from natural language prompts using OpenAI.
 * It uses blob imports to dynamically load the generated component code.
 */

import React, { type ComponentType } from 'react'
import { getComponentNames, loadComponent } from './components'

/**
 * Build a description of available components for the system prompt
 */
function buildComponentContext(): string {
  const components = getComponentNames()
  if (components.length === 0) {
    return 'No components are available in the component map.'
  }
  
  return `Available components in the component map:
${components.map(name => `- ${name}`).join('\n')}

These components will be passed to your function via the 'deps' parameter.
You can access them like: deps.Button, deps.Card, etc.`
}

// ============================================================================
// OpenAI API
// ============================================================================

/**
 * Call OpenAI API to generate component code
 */
async function callOpenAI(
  userPrompt: string,
  systemPrompt: string
): Promise<string> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OpenAI API key is required. Set VITE_OPENAI_API_KEY environment variable.')
  }

  const model = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }))
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('No content in OpenAI response')
  }

  return content
}

// ============================================================================
// Code Extraction
// ============================================================================

/**
 * Extract ES6 module code from LLM response
 * Looks for code blocks or extracts the entire response if it's valid JS
 */
function extractModuleCode(response: string): string {
  // Try to extract code from markdown code blocks
  const codeBlockRegex = /```(?:javascript|js|typescript|ts)?\s*\n([\s\S]*?)```/
  const match = response.match(codeBlockRegex)
  
  if (match && match[1]) {
    return match[1].trim()
  }
  
  // If no code block, try to find export default pattern
  if (response.includes('export default')) {
    // Extract from export default to end of string
    const exportIndex = response.indexOf('export default')
    const extracted = response.substring(exportIndex)
    return extracted.trim()
  }
  
  // Return the whole response if it looks like valid JS
  return response.trim()
}

// ============================================================================
// Blob Import (similar to compiler.ts)
// ============================================================================

/**
 * Load a React component from generated ES6 module code using blob import
 */
async function loadComponentFromBlob(
  moduleCode: string,
  componentMap: Record<string, any>
): Promise<ComponentType> {
  // Create blob with the module code
  const blob = new Blob([moduleCode], { type: 'application/javascript' })
  const blobUrl = URL.createObjectURL(blob)

  try {
    // Import the blob as an ES module
    const module = await import(/* @vite-ignore */ blobUrl)
    const ComponentFactory = module.default
    
    if (!ComponentFactory || typeof ComponentFactory !== 'function') {
      throw new Error('Generated module must export a default function')
    }

    // Call the factory function with React and component map (deps)
    const Component = ComponentFactory(React, componentMap)
    
    if (!Component) {
      throw new Error('Component factory did not return a valid component')
    }

    return Component
  } catch (error) {
    console.error('Error loading component from blob:', error)
    console.error('Generated code:', moduleCode)
    throw error
  } finally {
    // Clean up blob URL
    URL.revokeObjectURL(blobUrl)
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Generate a React component from a natural language prompt
 * 
 * @param userPrompt - Natural language description of the UI to generate
 * @returns Promise that resolves to a React component
 * 
 * @example
 * ```ts
 * const Component = await generateUI('Create a button that says "Click me"')
 * ReactDOM.createRoot(el).render(React.createElement(Component))
 * ```
 */
export async function generateUI(
  userPrompt: string
): Promise<ComponentType> {
  // Build system prompt with component context
  const componentContext = buildComponentContext()
  const systemPrompt = `You are a React component generator. Generate ES6 module code that exports a default function.

The function signature must be:
\`\`\`javascript
export default function MyComponent(React, deps) {
  // Your component code here
  // Use React.createElement to build the UI
  // Access components from deps (e.g., deps.Button, deps.Card)
  // Return a React component function (not a React element)
}
\`\`\`

Requirements:
1. Use React.createElement (not JSX) - this is required for dynamic generation
2. The function receives React as the first parameter and deps (component map) as the second parameter
3. Access components from the deps object (e.g., const Button = deps.Button)
4. Return a valid React component function (a function that can be used as a component, which returns React elements when called)
5. Use Tailwind CSS classes for styling (e.g., className: 'p-4 bg-gray-100')
6. Only use components that are available in the component map

${componentContext}

Example:
\`\`\`javascript
export default function MyComponent(React, deps) {
  const { Button } = deps;
  return function Component() {
    return React.createElement('div', { className: 'p-4' },
      React.createElement(Button, { className: 'bg-blue-500 text-white px-4 py-2' }, 'Click me')
    );
  };
}
\`\`\`

Generate only the ES6 module code, no explanations or markdown outside code blocks.`

  // Call OpenAI API
  const response = await callOpenAI(userPrompt, systemPrompt)
  
  // Extract module code from response
  const moduleCode = extractModuleCode(response)
  
  // Load components from the component map
  const componentMap: Record<string, any> = {}
  const componentNames = getComponentNames()
  
  for (const name of componentNames) {
    try {
      const component = await loadComponent(name)
      if (component) {
        componentMap[name] = component
      }
    } catch (error) {
      console.warn(`Failed to load component "${name}" for component map:`, error)
    }
  }
  
  // Load component from blob
  const Component = await loadComponentFromBlob(moduleCode, componentMap)
  
  return Component
}
