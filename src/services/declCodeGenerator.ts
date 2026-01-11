/**
 * DECL Code Generator Service
 * 
 * This service generates flattened JSON structure from natural language prompts using OpenAI.
 * The output follows the DECL format as described in GENUI_DECL_PROPOSAL.md
 */

import { getAllComponentDefinitions } from './components'
import { getAllActionDefinitions } from './actions'
import { callOpenAIStreaming, type UpdateCallback } from './openai'

// Re-export UpdateCallback for backward compatibility
export type { UpdateCallback }

// ============================================================================
// JSON Extraction
// ============================================================================

/**
 * Extract JSON from LLM response
 * Looks for JSON code blocks or extracts JSON from the response
 */
function extractJSON(response: string): any {
  // Try to extract JSON from markdown code blocks
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)```/
  const match = response.match(jsonBlockRegex)
  
  if (match && match[1]) {
    try {
      return JSON.parse(match[1].trim())
    } catch (e) {
      // If parsing fails, try the whole match
    }
  }
  
  // Try to find JSON array in the response
  const jsonArrayRegex = /\[[\s\S]*\]/
  const arrayMatch = response.match(jsonArrayRegex)
  
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0])
    } catch (e) {
      // If parsing fails, continue
    }
  }
  
  // Try to parse the whole response as JSON
  try {
    return JSON.parse(response.trim())
  } catch (e) {
    throw new Error('Failed to extract valid JSON from AI response')
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Element structure in DECL format
 */
export interface DeclElement {
  key: string
  type: string
  props?: Record<string, any>
  children?: string[]
}

/**
 * Flattened tree structure for DECL format
 * Array of elements where the first element is the root
 */
export type DeclStructure = DeclElement[]

/**
 * Generate flattened JSON structure from a natural language prompt
 * 
 * @param userPrompt - Natural language description of the UI to generate
 * @param context - Context object with onUpdate callback for streaming updates
 * @returns Promise that resolves to the generated DECL structure
 * 
 * @example
 * ```ts
 * const decl = await generate('Create a contact form', {
 *   onUpdate: ({ type, text }) => {
 *     if (type === 'replace') console.log(text)
 *     else process.stdout.write(text)
 *   }
 * })
 * ```
 */
export async function generate(
  userPrompt: string,
  context?: { onUpdate?: UpdateCallback }
): Promise<DeclStructure> {
  // Build system prompt with component and action context
  const componentDefs = getAllComponentDefinitions(true)
  const actionDefs = getAllActionDefinitions(true)
  
  const componentContext = componentDefs.length === 0
    ? 'No components are available.'
    : `Available COMPONENTS (UI building blocks):

${JSON.stringify(componentDefs, null, 2)}`

  const actionContext = actionDefs.length === 0
    ? 'No actions are available.'
    : `Available ACTIONS (UI boundary - external system communication):

${JSON.stringify(actionDefs, null, 2)}`

  const systemPrompt = `You are a UI generation assistant. Generate a flattened JSON structure that represents a UI component tree.

Given a user's request, reason about which components and actions to use, compose them into a flattened tree structure, and provide the correct inputs according to each tool's JSON Schema.

OUTPUT FORMAT:
You must generate a JSON array with this exact structure:
\`\`\`json
[
  {
    "key": "rootKey",
    "type": "ComponentName",
    "props": {
      "propName": "propValue",
      "propAction": {
        "name": "actionNameInLoadedActions",
        "params": {
          "paramName": "paramValue"
        }
      }
    },
    "children": ["childKey1", "childKey2"]
  },
  {
    "key": "childKey1",
    "type": "ComponentName",
    "props": {
      "propName": "propValue"
    }
  },
  {
    "key": "childKey2",
    "type": "ComponentName",
    "props": {
      "propName": "propValue"
    }
  }
]
\`\`\`

REQUIREMENTS:
1. Structure: Use a JSON array where each element is an object with key, type, props, and optional children
2. Root: The first element in the array is the root element
3. Keys: Each element must have a unique "key" that is used to reference it in children arrays
4. Type: The "type" must match a component name from the available components (case-sensitive)
5. Props: Component properties must match the JSON Schema defined in the component's params. Only include props that are defined in the component's params.
6. Children: Use an array of child element keys (strings) to reference children, not nested objects
7. Component preference: Always prefer using components from the component map over DOM elements
8. Actions: For action field try to put proper action name and also give param properly.
9. className: Only include className prop if the component's params include 'className', or for DOM elements

${componentContext}

${actionContext}

Generate only valid JSON, no explanations or markdown outside code blocks.`

  // Call OpenAI API with streaming
  const response = await callOpenAIStreaming(userPrompt, systemPrompt, context?.onUpdate)
  
  // Extract and parse JSON from response
  const declStructure = extractJSON(response)
  
  // Validate basic structure
  if (!Array.isArray(declStructure)) {
    throw new Error('Invalid DECL structure: expected a JSON array')
  }
  
  if (declStructure.length === 0) {
    throw new Error('Invalid DECL structure: array must contain at least one element (the root)')
  }
  
  // Validate each element has required fields
  for (const element of declStructure) {
    if (!element.key || !element.type) {
      throw new Error('Invalid DECL structure: each element must have "key" and "type" fields')
    }
  }
  
  return declStructure
}
