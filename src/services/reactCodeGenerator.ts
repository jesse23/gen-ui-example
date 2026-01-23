/**
 * React Code Generator Service
 * 
 * This service generates React component code from natural language prompts using OpenAI.
 */

import { getAllComponentDefinitions } from '../components/react'
import { callOpenAI } from './openai'

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
// Main API
// ============================================================================

/**
 * Generate React component code from a natural language prompt
 * 
 * @param userPrompt - Natural language description of the UI to generate
 * @returns Promise that resolves to the generated ES6 module code as a string
 * 
 * @example
 * ```ts
 * const code = await generate('Create a button that says "Click me"')
 * // code is the ES6 module string that exports a default function
 * ```
 */
export async function generate(
  userPrompt: string
): Promise<string> {
  // Build system prompt with component context
  const componentDefs = getAllComponentDefinitions(true)
  const componentContext = componentDefs.length === 0
    ? 'No components are available in the component map.'
    : `Available components in the component map:

${JSON.stringify(componentDefs, null, 2)}

These components will be passed to your function via the 'deps' parameter.
You can access them like: deps.Button, deps.Card, etc. Or you can use OOTB DOM elements.`
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
1. Function signature: The function receives React as the first parameter and deps (component map) as the second parameter. Return a valid React component function.
2. Use React.createElement (not JSX) - this is required for dynamic generation.
3. Component usage: Always prefer components from deps over DOM elements (e.g., use deps.Button instead of React.createElement('button'), deps.Input instead of React.createElement('input')). Only use DOM elements when no equivalent component exists in the component map.
4. Styling: Use Tailwind CSS classes via className prop. Only pass className to components that have 'className' in their params (check the component map) or to DOM elements. If a component's params don't include 'className', do not pass it.

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
  
  return moduleCode
}
