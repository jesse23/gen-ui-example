/**
 * DECL Code Generator Service
 * 
 * This service generates flattened JSON structure from natural language prompts using OpenAI.
 * The output follows the DECL format as described in GENUI_DECL_PROPOSAL.md
 */

import { callOpenAIStreaming } from '../openai'
import type { DeclView, DeclData, DeclSpec, DeclUpdate, DeclGenerateContext } from './types'
import { deepMergeData, tryParseJsonFromText } from './utils'

// ============================================================================
// Stream Aggregation
// ============================================================================

/**
 * Apply a single data update to the current data store (immutable).
 */
function applyDataChunk(
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
function applyViewChunk(
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

/**
 * Aggregate an array of stream updates into a single DeclSpec.
 */
function aggregateDeclUpdates(updates: DeclUpdate[]): DeclSpec {
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

// ============================================================================
// LLM Generation
// ============================================================================

/**
 * Convert parsed JSON array to DeclUpdate[].
 * Only accepts arrays; filters to valid update objects (with view or data key).
 * Returns empty array if input is null or not an array.
 */
function toDeclUpdates(parsed: unknown): DeclUpdate[] {
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (item): item is DeclUpdate =>
      item != null && typeof item === 'object' && ('view' in item || 'data' in item)
  )
}

/**
 * Generate flattened JSON structure from a natural language prompt
 * 
 * @param userPrompt - Natural language description of the UI to generate
 * @param context - Context with componentDefinitions, actionDefinitions (caller provides via getAllComponentDefinitions(true), getAllActionDefinitions(true)), and optional onUpdate for streaming
 * @returns Promise that resolves to the aggregated { view, data } response
 * 
 * @example
 * ```ts
 * const spec = await generate('Create a contact form', {
 *   componentDefinitions: getAllComponentDefinitions(true),
 *   actionDefinitions: getAllActionDefinitions(true),
 *   onUpdate: (streamingSpec) => { ... }
 * })
 * ```
 */
export async function generate(
  userPrompt: string,
  context: DeclGenerateContext
): Promise<DeclSpec> {
  const { componentDefinitions: componentDefs, actionDefinitions: actionDefs, onUpdate } = context

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

  // Accumulate streaming text and parse incrementally; cache last aggregated spec to avoid re-aggregating when count unchanged
  let streamedText = ''
  let latestUpdateContext: { updateCount: number; spec: DeclSpec } = {
    updateCount: 0,
    spec: { view: [], data: {} }
  }

  const handleStreamChunk = onUpdate
    ? ({ type, text }: { type: 'replace' | 'append'; text: string }) => {
        if (type === 'replace') {
          streamedText = text
        } else {
          streamedText += text
        }
        const updates = toDeclUpdates(tryParseJsonFromText(streamedText).value)
        if (updates.length > latestUpdateContext.updateCount) {
          latestUpdateContext = {
            updateCount: updates.length,
            spec: aggregateDeclUpdates(updates)
          }
          onUpdate(latestUpdateContext.spec)
        }
      }
    : undefined

  // Call OpenAI API with streaming
  const response = await callOpenAIStreaming(userPrompt, systemPrompt, handleStreamChunk)

  // Extract and parse JSON from response (expected: array of DeclUpdates)
  const updates = toDeclUpdates(tryParseJsonFromText(response).value)

  if (updates.length === 0) {
    throw new Error('Invalid response: expected a JSON array of updates')
  }

  // Reuse cached spec if we already aggregated this many updates during streaming
  if (updates.length === latestUpdateContext.updateCount) {
    return latestUpdateContext.spec
  }
  return aggregateDeclUpdates(updates)
}
