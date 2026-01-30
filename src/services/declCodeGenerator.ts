/**
 * DECL Code Generator Service
 * 
 * This service generates flattened JSON structure from natural language prompts using OpenAI.
 * The output follows the DECL format as described in GENUI_DECL_PROPOSAL.md
 */

import { getAllComponentDefinitions } from '../components/decl'
import { getAllActionDefinitions } from './actions'
import { callOpenAIStreaming } from './openai'

// ============================================================================
// Types
// ============================================================================

/**
 * A single node in the DECL view tree (instance of a component in the tree).
 */
export interface DeclNode {
  key: string
  type: string
  props?: Record<string, any>
  children?: string[]
}

/**
 * View tree: array of DeclNodes (flattened tree for DECL format).
 */
export type DeclView = DeclNode[]

/**
 * Data backing the view (store / view model).
 */
export type DeclData = Record<string, any>

/**
 * UI render definition: view tree + data. The complete spec passed to the renderer.
 */
export interface DeclSpec {
  view: DeclView
  data: DeclData
}

/**
 * Callback for streaming DECL generation updates.
 * Receives the current aggregated structure as it's being built from the stream.
 */
export type DeclUpdateCallback = (update: DeclSpec) => void

/**
 * A single streaming update (internal).
 * While streaming, the model outputs an array of these.
 * Each update has exactly one key: "view" or "data".
 */
type DeclUpdate =
  | { view: DeclView }
  | { data: DeclData }

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
// Delta Merge Utilities
// ============================================================================

/**
 * Merge strategy at a node:
 * - Objects: deep merge (patch keys merged into existing; new object returned).
 * - Arrays: replace (patch array replaces existing).
 * - Primitives / null: replace.
 * Does not mutate; returns a new object when merging objects.
 */
export function deepMergeData(
  existing: DeclData,
  patch: DeclData
): DeclData {
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) {
    return existing
  }
  const result = { ...existing }
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key]
    const existingVal = result[key]
    if (
      patchVal != null &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      existingVal != null &&
      typeof existingVal === 'object' &&
      !Array.isArray(existingVal)
    ) {
      result[key] = deepMergeData(existingVal, patchVal)
    } else {
      result[key] = patchVal
    }
  }
  return result
}

/**
 * Apply a single data update to the current data store (immutable).
 */
export function applyDataChunk(
  current: DeclData,
  update: { data: DeclData }
): DeclData {
  const data = update?.data
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    return current
  }
  return deepMergeData(current, data)
}

/**
 * Apply a single view update to the current view.
 * Merge by key: if the patch contains a node with the same key as one in current, the patch wins (replace). Otherwise append.
 * This avoids duplicate keys when the agent emits the same key in multiple view updates.
 */
export function applyViewChunk(
  current: DeclView,
  update: { view: DeclView }
): DeclView {
  const viewPatch = update?.view
  if (!Array.isArray(viewPatch)) return current
  const patchKeys = new Set(
    viewPatch.map((e) => (e.key != null ? String(e.key) : ''))
  )
  const kept = current.filter(
    (el) => !patchKeys.has(el.key != null ? String(el.key) : '')
  )
  return [...kept, ...viewPatch]
}

// ============================================================================
// Stream Aggregation
// ============================================================================

/**
 * Aggregate an array of stream updates into a single DeclSpec.
 */
function aggregateUpdates(updates: DeclUpdate[]): DeclSpec {
  let view: DeclView = []
  let data: DeclData = {}

  for (const update of updates) {
    if (update && typeof update === 'object' && 'view' in update) {
      view = applyViewChunk(view, update as { view: DeclView })
      continue
    }
    if (update && typeof update === 'object' && 'data' in update) {
      data = applyDataChunk(data, update as { data: DeclData })
    }
  }

  return { view, data }
}

/**
 * Parse streaming text incrementally and return aggregated DeclSpec.
 * Supports: (1) array of updates [{ "view": [...] }, { "data": {} }], (2) single object { "view": [...], "data": {} }.
 * Returns null if no valid JSON can be parsed yet.
 */
function parseStreamingText(text: string): DeclSpec | null {
  if (!text.trim()) return null

  let jsonText = text
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)(?:```|$)/
  const match = text.match(jsonBlockRegex)
  if (match && match[1]) {
    jsonText = match[1].trim()
  }

  // --- Array format: [ { "view": [...] }, { "data": {} }, ... ] ---
  const arrayStart = jsonText.indexOf('[')
  if (arrayStart !== -1) {
    const arrayContent = jsonText.substring(arrayStart + 1)
    let braceCount = 0
    let inString = false
    let escapeNext = false
    let lastCompleteEnd = -1

    for (let i = 0; i < arrayContent.length; i++) {
      const char = arrayContent[i]
      if (escapeNext) {
        escapeNext = false
        continue
      }
      if (char === '\\') {
        escapeNext = true
        continue
      }
      if (char === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (char === '{') {
        braceCount++
      } else if (char === '}') {
        braceCount--
        if (braceCount === 0) {
          lastCompleteEnd = i + 1
        }
      }
    }

    if (lastCompleteEnd > 0) {
      const raw = arrayContent.substring(0, lastCompleteEnd).trim().replace(/,\s*$/, '')
      try {
        const updates = JSON.parse('[' + raw + ']') as DeclUpdate[]
        if (Array.isArray(updates)) {
          return aggregateUpdates(updates)
        }
      } catch (_) {
        // fall through
      }
    }

    // Whole array might be complete (ends with ])
    const trimmed = jsonText.substring(arrayStart).trim()
    if (trimmed.endsWith(']')) {
      try {
        const updates = JSON.parse(trimmed) as DeclUpdate[]
        if (Array.isArray(updates)) {
          return aggregateUpdates(updates)
        }
      } catch (_) {
        // fall through
      }
    }
  }

  // --- Object format: { "view": [...], "data": {} } ---
  const objectStart = jsonText.indexOf('{')
  if (objectStart !== -1) {
    let depth = 0
    let inString = false
    let escapeNext = false
    let endIndex = -1
    for (let i = objectStart; i < jsonText.length; i++) {
      const char = jsonText[i]
      if (escapeNext) {
        escapeNext = false
        continue
      }
      if (char === '\\') {
        escapeNext = true
        continue
      }
      if (char === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) {
          endIndex = i + 1
          break
        }
      }
    }
    if (endIndex > 0) {
      try {
        const spec = JSON.parse(jsonText.substring(0, endIndex).trim()) as { view?: DeclView; data?: DeclData }
        if (spec && typeof spec === 'object' && !Array.isArray(spec)) {
          return {
            view: Array.isArray(spec.view) ? spec.view : [],
            data: (spec.data && typeof spec.data === 'object' && !Array.isArray(spec.data)) ? spec.data : {}
          }
        }
      } catch (_) {
        // fall through
      }
    }
  }

  return null
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Generate flattened JSON structure from a natural language prompt
 * 
 * @param userPrompt - Natural language description of the UI to generate
 * @param context - Context object with onUpdate callback for streaming updates
 * @returns Promise that resolves to the aggregated { view, data } response
 * 
 * @example
 * ```ts
 * const spec = await generate('Create a contact form', {
 *   onUpdate: (streamingSpec) => {
 *     console.log('Current view:', streamingSpec.view.length, 'nodes')
 *     console.log('Current data keys:', Object.keys(streamingSpec.data))
 *   }
 * })
 * ```
 */
export async function generate(
  userPrompt: string,
  context?: { onUpdate?: DeclUpdateCallback }
): Promise<DeclSpec> {
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

CHUNK ORDER (MANDATORY — SMALL DATA CHUNKS, INTERLEAVED WITH VIEWS):
The output is a JSON array. Each item is exactly one chunk: either { "view": [...] } or { "data": {...} }.
- Split data into SMALL chunks (one or two fields per chunk). Do NOT emit one big data chunk with all fields.
- For each field that needs data: emit data chunk (just that field) → then the view chunk for that field.
- Pattern: data(field1) → view(field1) → data(field2) → view(field2) → ...
- If a view has no data refs, emit view chunk only (no data chunk).
- WRONG: [ data(all fields), view, view, view, ... ] — one big data chunk then all views. Invalid.
- RIGHT: interleaved small data chunks and views: data, view, data, view, ...

OUTPUT FORMAT:
- One chunk = one array element with exactly one key "view" OR "data". Client appends view arrays and deep-merges data (leaf-level merge).
- Keep data chunks small (1-2 fields each) so the UI renders incrementally as each data+view pair arrives.

CORRECT EXAMPLE (small data chunks interleaved with views):
\`\`\`json
[
  { "data": { "pageTitle": "Contact" } },
  { "view": [ { "key": "root", "type": "Card", "props": { "title": "{pageTitle}" }, "children": ["form1"] } ] },
  { "view": [ { "key": "form1", "type": "Form", "props": {}, "children": ["f1", "f2", "submitBtn"] } ] },
  { "data": { "profile": { "firstName": { "type": "text", "name": "First Name", "value": "", "placeholder": "First name" } } } },
  { "view": [ { "key": "f1", "type": "Field", "props": { "dataBind": "profile.firstName" } } ] },
  { "data": { "profile": { "lastName": { "type": "text", "name": "Last Name", "value": "", "placeholder": "Last name" } } } },
  { "view": [ { "key": "f2", "type": "Field", "props": { "dataBind": "profile.lastName" } } ] },
  { "view": [ { "key": "submitBtn", "type": "Button", "props": { "text": "Submit", "onClick": { "name": "submit", "params": { "data": "{profile}" } } } ] }
]
\`\`\`
(Each field's data is a separate chunk right before that field's view. The client deep-merges, so profile.firstName and profile.lastName merge into one profile object. Never emit one big data chunk with all fields at once.)

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
1. Chunk order: for each field that needs data, emit a small data chunk (just that field) then the view chunk for that field. Keep data chunks small (1-2 fields). Never emit one big data chunk with all fields at once.
2. Each chunk = one array element, one key "view" or "data". Client appends view and deep-merges data.
3. View: array of DECL elements with a unique "key" across the entire view. "type" (from available components), "props", optional "children" (array of keys).
4. Props must match each component's params schema; only include params that exist.
5. Prefer components from the list over raw DOM.
6. Actions: use correct action name and params. Add "returns" when the action definition has returns.
7. Include className only if the component's params define it.

${componentContext}

${actionContext}

Generate only valid JSON, no explanations or markdown outside code blocks.`

  // Accumulate streaming text and parse incrementally
  let streamedText = ''
  let lastSpec: DeclSpec | null = null

  const internalOnUpdate = context?.onUpdate
    ? ({ type, text }: { type: 'replace' | 'append'; text: string }) => {
        // Accumulate the text
        if (type === 'replace') {
          streamedText = text
        } else {
          streamedText += text
        }

        // Try to parse the accumulated text into a DeclSpec
        const spec = parseStreamingText(streamedText)
        if (spec) {
          // Only notify if the spec changed
          const specJson = JSON.stringify(spec)
          const lastJson = lastSpec ? JSON.stringify(lastSpec) : null
          if (specJson !== lastJson) {
            lastSpec = spec
            context.onUpdate!(spec)
          }
        }
      }
    : undefined

  // Call OpenAI API with streaming
  const response = await callOpenAIStreaming(userPrompt, systemPrompt, internalOnUpdate)
  
  // Extract and parse JSON from response (expected: array of DeclUpdates)
  const updates = extractJSON(response) as DeclUpdate[]

  if (!Array.isArray(updates)) {
    throw new Error('Invalid response: expected a JSON array of updates')
  }

  return aggregateUpdates(updates)
}
