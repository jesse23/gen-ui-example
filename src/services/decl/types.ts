/**
 * DECL service type definitions.
 * Types used only inside the folder are defined here but not re-exported from index.
 */

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
export type DeclUpdate =
  | { view: DeclView }
  | { data: DeclData }

/**
 * Context for the generate API. Caller provides component and action definitions
 * (e.g. from getAllComponentDefinitions(true) and getAllActionDefinitions(true)).
 */
export interface DeclGenerateContext {
  /** Component definitions for the prompt (name, description, params). Exclude load for prompt. */
  componentDefinitions: Array<{ name: string; description: string; params?: Record<string, any> }>
  /** Action definitions for the prompt (name, description, params, returns). Exclude handler for prompt. */
  actionDefinitions: Array<{ name: string; description: string; params?: Record<string, any>; returns?: Record<string, any> }>
  /** Called with the current DeclSpec on each streaming update. Optional. */
  onUpdate?: DeclUpdateCallback
}

/**
 * Result from tryParseJsonFromText.
 * - value: parsed JSON or null if nothing parseable yet
 * - startIndex: position where JSON structure starts (-1 if nothing found)
 * - endIndex: position after the parsed content (-1 if nothing parsed)
 */
export interface StreamParseResult {
  value: unknown | null
  startIndex: number
  endIndex: number
}
