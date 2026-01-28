/**
 * DECL Code Generator Service
 * 
 * This service generates flattened JSON structure from natural language prompts using OpenAI.
 * The output follows the DECL format as described in GENUI_DECL_PROPOSAL.md
 */

import { getAllComponentDefinitions } from '../components/decl'
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
 * Streaming response chunk.
 * While streaming, the model outputs an array of these chunks.
 * Each chunk must have exactly one key: "view" or "data".
 */
export type DeclStreamChunk =
  | { view: DeclStructure }
  | { data: Record<string, any> }

/**
 * The model's streaming-friendly output format: an array of chunks.
 */
export type DeclStreamResponse = DeclStreamChunk[]

/**
 * Final aggregated response after applying all streamed chunks.
 */
export interface DeclAggregatedResponse {
  view: DeclStructure
  data: Record<string, any>
}

function aggregateDeclStream(chunks: DeclStreamResponse): DeclAggregatedResponse {
  const aggregated: DeclAggregatedResponse = { view: [], data: {} }

  for (const chunk of chunks) {
    if (chunk && typeof chunk === 'object' && 'view' in chunk) {
      const viewPatch = (chunk as any).view
      if (Array.isArray(viewPatch)) {
        aggregated.view.push(...viewPatch)
      }
      continue
    }

    if (chunk && typeof chunk === 'object' && 'data' in chunk) {
      const dataPatch = (chunk as any).data
      if (dataPatch && typeof dataPatch === 'object' && !Array.isArray(dataPatch)) {
        // For now: shallow "set" semantics (last write wins)
        Object.assign(aggregated.data, dataPatch)
      }
    }
  }

  return aggregated
}

/**
 * Generate flattened JSON structure from a natural language prompt
 * 
 * @param userPrompt - Natural language description of the UI to generate
 * @param context - Context object with onUpdate callback for streaming updates
 * @returns Promise that resolves to the aggregated { view, data } response
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
): Promise<DeclAggregatedResponse> {
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

  const systemPrompt = `You are a UI generation assistant. Given a user request, choose components and actions, compose a flattened tree (view + data), and match each component's JSON Schema.

OUTPUT FORMAT (streaming-friendly):
- Output a JSON array of delta chunks. Each chunk is an object with exactly one key: "view" OR "data".
- The client streams your response and parses chunks as they arrive. It aggregates by: appending each "view" array to the running view list, and shallow-merging each "data" object into the data store.
- Emit multiple chunks so the UI can render incrementally (e.g. one or more view chunks, then data if needed). Do not output a single object with both "view" and "data"; use separate chunks.

Example (client will append view chunks and merge data chunks):
\`\`\`json
[
  { "data": { "title": "My Page" } },
  { "view": [ { "key": "root", "type": "ComponentName", "props": { "text": "{title}" }, "children": ["child1"] } ] },
  { "view": [ { "key": "child1", "type": "Other", "props": {} } ] }
]
\`\`\`

DATA STORE AND VARIABLES:
- Store starts empty. Use "{path}" to read a value (e.g. "{userName}", "{position.x}"). The prop value must be exactly that string—do not embed {path} inside other text; for composed text, put the full string in the store and reference it.
- Props and action params can use "{path}".

DATA BINDING (dataBind):
- Use "dataBind": "path" (dot-separated) for inputs so value and onChange are wired automatically.
- TextBox: path can be a scalar (e.g. user.name: "") or a Property object.
- Field: path must be a Property object: { type: "text"|"number"|..., name: "Label", value: ""|0, placeholder?: "hint" }. name is the label; value is the current value.
  Example for Field: "dataBind": "profile.firstName" with data "profile": { "firstName": { "type": "text", "name": "First Name", "value": "", "placeholder": "First Name" } }.

ACTION RETURNS:
- If an action has "returns" in its definition, add "returns": { "attr": "storePath" } to the action config to write return values into the store.

RULES:
1. Output: JSON array of delta chunks. Each chunk has exactly one key: "view" or "data". Client appends view arrays and merges data objects in order.
2. Emit multiple chunks (e.g. several view chunks) so the client can render incrementally; do not output one big object with both view and data.
3. View: array of DECL elements with unique "key", "type" (from available components), "props", optional "children" (array of keys).
4. Props must match each component's params schema; only include params that exist.
5. Prefer components from the list over raw DOM.
6. Actions: use correct action name and params. Add "returns" when the action definition has returns.
7. Include className only if the component's params define it.

${componentContext}

${actionContext}

Generate only valid JSON, no explanations or markdown outside code blocks.`

  // Call OpenAI API with streaming
  const response = await callOpenAIStreaming(userPrompt, systemPrompt, context?.onUpdate)
  
  // Extract and parse JSON from response (expected: array of chunks)
  const chunks = extractJSON(response) as DeclStreamResponse

  if (!Array.isArray(chunks)) {
    throw new Error('Invalid response: expected a JSON array of chunks')
  }

  return aggregateDeclStream(chunks)
}
