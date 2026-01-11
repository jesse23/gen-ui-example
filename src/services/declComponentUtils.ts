import React, { type ReactNode } from 'react'
import { type DeclElement } from './declCodeGenerator'
import { getAllComponentDefinitions, loadComponent, getComponentDefinition } from './components'
import { getAllActionDefinitions, loadAction } from './actions'

// Load all components from the component map (like blobJsLoader does)
export async function loadAllComponents(): Promise<Map<string, any>> {
  const componentMap = new Map<string, any>()
  const componentDefs = getAllComponentDefinitions()
  
  for (const def of componentDefs) {
    try {
      const component = await loadComponent(def.name)
      if (component) {
        componentMap.set(def.name, component)
      }
    } catch (error) {
      console.warn(`Failed to load component "${def.name}":`, error)
    }
  }
  
  return componentMap
}

// Load all actions from the action map
export function loadAllActions(): Map<string, (...args: any[]) => any> {
  const actionMap = new Map<string, (...args: any[]) => any>()
  const actionDefs = getAllActionDefinitions()
  
  for (const def of actionDefs) {
    const action = loadAction(def.name)
    if (action) {
      actionMap.set(def.name, action)
    }
  }
  
  return actionMap
}

// Render context containing all necessary data for rendering
export interface RenderContext {
  declElements: Map<string, DeclElement>
  loadedComponents: Map<string, any>
  loadedActions: Map<string, (...args: any[]) => any>
}

// Helper function to render an array of element keys into ReactNodes
export function renderDeclElements(
  keys: string[],
  context: RenderContext
): ReactNode[] {
  return keys
    .map((childKey) => {
      // renderDeclElement will look up the element by key
      return renderDeclElement(childKey, context)
    })
    .filter((node) => node !== null && node !== undefined) as ReactNode[]
}

// Render a DECL element as a React component - simple function that just creates elements from JSON
export function renderDeclElement(
  elementKey: string,
  context: RenderContext
): ReactNode {
  const element = context.declElements.get(elementKey)
  if (!element) {
    return null // Element not found yet (streaming)
  }
  
  const { type, props = {}, children: topLevelChildren } = element
  
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
    return React.createElement('div', { key: elementKey, className: 'p-2 bg-red-50 border border-red-200 rounded text-red-600 text-sm' },
      `Error: Component "${type}" not found`
    )
  }

  // Get child keys (array of strings)
  const childKeys = Array.isArray(children) ? children.filter((c): c is string => typeof c === 'string') : []

  // Process props - keep children so processProps can process it, but remove key
  const processedProps: Record<string, any> = { ...props }
  // If children came from topLevelChildren, put it in processedProps so processProps can see it
  if (topLevelChildren && Array.isArray(topLevelChildren)) {
    processedProps.children = topLevelChildren
  }
  // Otherwise, children is already in props.children (or undefined)
  delete processedProps.key // Ensure key from props doesn't override our explicit key

  // Render children by looking them up in elements map (for fallback if not processed by processProps)
  // Each child will have its own key from the element.key property
  const childNodes = renderDeclElements(childKeys, context)

  // Apply component-specific prop processing if defined
  // This may process children (convert keys to rendered nodes) and bind actions if the component defines it
  const componentDef = getComponentDefinition(type)
  if (componentDef?.processProps) {
    Object.assign(processedProps, componentDef.processProps(processedProps, context))
  }

  // If processedProps has children (processed by processProps), pass as prop
  // Otherwise, pass childNodes as React children (third argument to createElement)
  if (processedProps.children !== undefined) {
    // Children were processed by processProps (converted from keys to rendered nodes), pass as prop
    return React.createElement(Component, { key: elementKey, ...processedProps })
  } else {
    // No processed children, pass childNodes as React children
    return React.createElement(Component, { key: elementKey, ...processedProps }, ...childNodes)
  }
}
