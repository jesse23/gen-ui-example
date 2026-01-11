/**
 * Blob JS Loader Service
 * 
 * This service loads React components from ES6 module code using blob imports.
 * Used by both reactCodeGenerator.ts and compiler.ts
 */

import { type ComponentType } from 'react'
import { getAllComponentDefinitions, loadComponent } from './components'

/**
 * Load all components from the component map and return them as a deps object
 * 
 * NOTE: We can be more smart to let the compiler detect which dependency component
 * is needed, and only load that component.
 */
async function loadComponentMap(): Promise<Record<string, any>> {
  const componentMap: Record<string, any> = {}
  const componentDefs = getAllComponentDefinitions()
  
  for (const def of componentDefs) {
    try {
      const component = await loadComponent(def.name)
      if (component) {
        componentMap[def.name] = component
      }
    } catch (error) {
      console.warn(`Failed to load component "${def.name}" for component map:`, error)
    }
  }
  
  return componentMap
}

/**
 * Check if an object is React (has createElement method)
 */
function isReact(obj: any): boolean {
  return obj && typeof obj.createElement === 'function'
}

/**
 * Load a React component from generated ES6 module code using blob import
 * 
 * @param moduleCode - The ES6 module code as a string
 * @param firstArg - First argument to pass to the factory function
 *                   If this is React, we'll load componentMap and pass it as second arg
 *                   Otherwise, pass all args as-is (for compiler pattern)
 * @param ...additionalArgs - Additional arguments to pass to the factory function
 * @returns Promise that resolves to a React component
 * 
 * @example
 * ```ts
 * // For reactCodeGenerator pattern: factory takes (React, deps)
 * const code = `export default function MyComponent(React, deps) { ... }`
 * const Component = await loadComponentFromBlob(code, React)
 * 
 * // For compiler pattern: factory takes (config, deps)
 * const code = `export default function createCompiledComponent(config, deps) { ... }`
 * const Component = await loadComponentFromBlob(code, config, deps)
 * ```
 */
export async function loadComponentFromBlob(
  moduleCode: string,
  firstArg: any,
  ...additionalArgs: any[]
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

    // If firstArg is React, load componentMap and pass it as second arg (reactCodeGenerator pattern)
    // Otherwise, pass all args as-is (compiler pattern)
    let Component: ComponentType
    if (isReact(firstArg)) {
      // Load all components from the component map before calling factory
      const componentMap = await loadComponentMap()
      Component = ComponentFactory(firstArg, componentMap, ...additionalArgs)
    } else {
      // Pass all args as-is (for compiler pattern)
      Component = ComponentFactory(firstArg, ...additionalArgs)
    }
    
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
