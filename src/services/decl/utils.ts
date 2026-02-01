import React, { type ReactNode } from 'react'
import { getComponentDefinition, type RenderContext } from '../../components/decl'
import { getActionDefinition } from '../actions'
import type { DeclData, StreamParseResult } from './types'

// ---------------------------------------------------------------------------
// JSON Extraction
// ---------------------------------------------------------------------------

/**
 * Try to extract and parse a JSON array or object from text.
 * 1. Extracts from markdown code block if present
 * 2. Tries JSON.parse on the whole text first (fast path for complete JSON)
 * 3. Falls back to scanning for complete JSON structure (handles incomplete streaming)
 * 
 * TOOD: for now this function has no ability to handle incremental parsing. We can do that
 * later as performance improvement.
 *
 * @param text - The text to parse
 * @param startIndex - Position to start scanning from (default 0).
 *                     Applied after markdown code block extraction (i.e., on the extracted content).
 * @returns { value, startIndex, endIndex } where indices are relative to the (possibly extracted) text
 */
export function tryParseJsonFromText(text: string, startIndex = 0): StreamParseResult {
  if (!text.trim()) return { value: null, startIndex: -1, endIndex: -1 }

  // Extract JSON from markdown code block if present
  let jsonText = text
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)(?:```|$)/
  const match = text.match(jsonBlockRegex)
  if (match && match[1]) {
    jsonText = match[1].trim()
  }

  // Fast path: try to parse from startIndex to end directly
  const textFromStart = jsonText.substring(startIndex).trim()
  if (textFromStart) {
    try {
      const value = JSON.parse(textFromStart)
      return { value, startIndex, endIndex: jsonText.length }
    } catch (_) {
      // Fall through to scanning logic
    }
  }

  // Find first [ or { from startIndex
  const arrayStart = jsonText.indexOf('[', startIndex)
  const objectStart = jsonText.indexOf('{', startIndex)
  const start =
    arrayStart !== -1 && (objectStart === -1 || arrayStart <= objectStart)
      ? arrayStart
      : objectStart
  if (start === -1) return { value: null, startIndex: -1, endIndex: -1 }

  const open = jsonText[start]
  const isArray = open === '['
  const close = isArray ? ']' : '}'

  let depth = 0
  let inString = false
  let escapeNext = false
  let lastCompleteElementEnd = -1

  for (let i = start; i < jsonText.length; i++) {
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

    if (char === '{' || char === '[') {
      depth++
    } else if (char === '}' || char === ']') {
      depth--
      // Track end of complete top-level elements inside array (depth 1 → 0 after `}`)
      if (isArray && depth === 1 && char === '}') {
        lastCompleteElementEnd = i + 1
      }
      // Found matching close for the whole value
      if (depth === 0 && char === close) {
        try {
          const value = JSON.parse(jsonText.substring(start, i + 1).trim())
          return { value, startIndex: start, endIndex: i + 1 }
        } catch (_) {
          return { value: null, startIndex: start, endIndex: -1 }
        }
      }
    }
  }

  // Incomplete: for arrays, try to parse all complete elements so far
  if (isArray && lastCompleteElementEnd > 0) {
    const raw = jsonText.substring(start + 1, lastCompleteElementEnd).trim().replace(/,\s*$/, '')
    try {
      const value = JSON.parse('[' + raw + ']')
      return { value, startIndex: start, endIndex: lastCompleteElementEnd }
    } catch (_) {
      // fall through
    }
  }

  return { value: null, startIndex: start, endIndex: -1 }
}

// ---------------------------------------------------------------------------
// Store path helpers
// ---------------------------------------------------------------------------

function getNestedValue(obj: Record<string, any>, path: string): any {
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = current[part]
  }
  return current
}

function setNestedValue(obj: Record<string, any>, path: string, value: any): void {
  const parts = path.split('.')
  let current = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {}
    }
    current = current[part]
  }
  current[parts[parts.length - 1]] = value
}

/**
 * Resolve {path} syntax in values using the data store.
 */
function resolveStoreVariables(value: any, dataStore: DeclData): any {
  if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
    const path = value.slice(1, -1).trim()
    return path.includes('.') ? getNestedValue(dataStore, path) : dataStore[path]
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const resolved: Record<string, any> = {}
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = resolveStoreVariables(val, dataStore)
    }
    return resolved
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveStoreVariables(item, dataStore))
  }
  return value
}

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

// ---------------------------------------------------------------------------
// View Parsing and binding
// ---------------------------------------------------------------------------

/**
 * Create a data binding for a store path.
 * Returns a getter and setter function for two-way binding.
 *
 * @param path - Dot-separated path in the data store (e.g., "user.name", "form.email")
 * @param context - Render context with dataStore and setDataStore
 * @returns Object with `get` (getter) and `set` (setter) functions
 */
export function createDataBind(
  path: string,
  context: RenderContext
): { get: () => any; set: (value: any) => void } {
  return {
    get: () => getNestedValue(context.dataStore, path),
    set: (newValue: any) => {
      context.setDataStore((prev) => {
        const updated = { ...prev }
        setNestedValue(updated, path, newValue)
        return updated
      })
    }
  }
}

/**
 * Create a callback that invokes an action when called.
 * Caller assigns the returned callback to the desired prop (e.g. onClick, onSubmit).
 *
 * @param actionConfig - Object { name, params?, returns? } or string (action name, legacy)
 * @param context - Render context with loadedActions and dataStore
 * @returns Callback to assign to the prop, or undefined if config is invalid/missing
 */
export function createActionBind(
  actionConfig: unknown,
  context: RenderContext
): ((...args: any[]) => any) | undefined {
  if (actionConfig == null) return undefined

  if (typeof actionConfig === 'object' && !Array.isArray(actionConfig)) {
    const config = actionConfig as { name?: string; params?: Record<string, any>; returns?: Record<string, string> }
    const actionName = config.name
    if (typeof actionName !== 'string') return undefined

    const actionHandler = context.loadedActions.get(actionName)
    if (!actionHandler) {
      console.warn(`Action "${actionName}" not found`)
      return undefined
    }

    const rawParams = config.params ?? {}
    let actionParams = resolveStoreVariables(rawParams, context.dataStore)
    if (actionName === 'submit' && (actionParams.data === undefined || actionParams.data === null)) {
      actionParams = { ...actionParams, data: context.dataStore }
    }
    const returnsMapping = config.returns

    return async (...args: any[]) => {
      const firstArg = args.length > 0 ? args[0] : undefined
      const isEvent =
        firstArg != null &&
        typeof firstArg === 'object' &&
        ('nativeEvent' in firstArg ||
          (typeof (firstArg as any).preventDefault === 'function' && 'target' in firstArg))
      const params =
        !isEvent && firstArg != null && typeof firstArg === 'object'
          ? { ...actionParams, ...firstArg }
          : actionParams

      const result = await actionHandler(params)

      if (returnsMapping && result !== undefined && result !== null) {
        const actionDef = getActionDefinition(actionName)
        if (actionDef?.returns) {
          context.setDataStore((prev) => {
            const updated = { ...prev }
            for (const [attr, path] of Object.entries(returnsMapping)) {
              if (typeof path === 'string' && result[attr] !== undefined) {
                setNestedValue(updated, path, result[attr])
              }
            }
            return updated
          })
        }
      }

      return result
    }
  }

  if (typeof actionConfig === 'string') {
    const actionHandler = context.loadedActions.get(actionConfig)
    if (!actionHandler) {
      console.warn(`Action "${actionConfig}" not found`)
      return undefined
    }
    return (...args: any[]) => {
      const randomParams = { value: Math.random().toString(36).substring(7) }
      const firstArg = args.length > 0 ? args[0] : undefined
      const isEvent =
        firstArg != null &&
        typeof firstArg === 'object' &&
        ('nativeEvent' in firstArg ||
          (typeof (firstArg as any).preventDefault === 'function' && 'target' in firstArg))
      const params =
        !isEvent && firstArg != null && typeof firstArg === 'object'
          ? { ...randomParams, ...firstArg }
          : randomParams
      return actionHandler(params)
    }
  }

  return undefined
}

// Helper function to render an array of node keys into ReactNodes
export function renderDeclNodes(
  keys: string[],
  context: RenderContext
): ReactNode[] {
  return keys
    .map((childKey) => {
      // renderDeclNode will look up the node by key
      return renderDeclNode(childKey, context)
    })
    .filter((node) => node !== null && node !== undefined) as ReactNode[]
}

// Render a DECL node as a React component - simple function that just creates elements from JSON
export function renderDeclNode(
  nodeKey: string,
  context: RenderContext
): ReactNode {
  const node = context.declNodes.get(nodeKey)
  if (!node) {
    return null // Node not found yet (streaming)
  }
  
  const { type, props = {}, children: topLevelChildren } = node
  
  // Get children from top level or from props.children (support both formats)
  const children = topLevelChildren || (props?.children && Array.isArray(props.children) ? props.children : [])

  // Get component from loaded components map, or use as DOM element
  let Component = context.loadedComponents.get(type)
  if (Component === undefined) {
    // Not in map - treat as DOM element (lowercase)
    Component = type.toLowerCase()
  }
  
  if (Component === null) {
    // Component failed to load - use JSON key
    return React.createElement('div', { key: nodeKey, className: 'p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm' },
      `Error: Component "${type}" not found`
    )
  }

  // Get child keys (array of strings)
  const childKeys = Array.isArray(children) ? children.filter((c): c is string => typeof c === 'string') : []

  // Resolve store variables; keep children so resolveProps can see it, but remove key
  const processedProps: Record<string, any> = resolveStoreVariables({ ...props }, context.dataStore)
  if (topLevelChildren && Array.isArray(topLevelChildren)) {
    processedProps.children = topLevelChildren
  }
  delete processedProps.key // Ensure key from props doesn't override our explicit key

  // Fallback: render children by keys if resolveProps didn't set children
  const childNodes = renderDeclNodes(childKeys, context)

  // Apply component-specific resolveProps if defined (keys → nodes, action configs → handlers)
  const componentDef = getComponentDefinition(type)
  if (componentDef?.resolveProps) {
    Object.assign(processedProps, componentDef.resolveProps(processedProps, context))
  }

  if (processedProps.children !== undefined) {
    // Children were resolved by resolveProps (keys → rendered nodes), pass as prop
    return React.createElement(Component, { key: nodeKey, ...processedProps })
  } else {
    // No processed children, pass childNodes as React children
    return React.createElement(Component, { key: nodeKey, ...processedProps }, ...childNodes)
  }
}
