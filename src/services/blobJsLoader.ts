/**
 * Blob JS Loader Service
 * 
 * This service loads React components from ES6 module code using blob imports.
 * Used by both reactCodeGenerator.ts and compiler.ts
 */

import { type ComponentType } from 'react'

/**
 * Load a React component from generated ES6 module code using blob import
 * 
 * @param moduleCode - The ES6 module code as a string
 * @param factoryArgs - Arguments to pass to the factory function exported by the module
 * @returns Promise that resolves to a React component
 * 
 * @example
 * ```ts
 * // For reactCodeGenerator pattern: factory takes (React, deps)
 * const code = `export default function MyComponent(React, deps) { ... }`
 * const Component = await loadComponentFromBlob(code, React, componentMap)
 * 
 * // For compiler pattern: factory takes (config, deps)
 * const code = `export default function createCompiledComponent(config, deps) { ... }`
 * const Component = await loadComponentFromBlob(code, config, deps)
 * ```
 */
export async function loadComponentFromBlob(
  moduleCode: string,
  ...factoryArgs: any[]
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

    // Call the factory function with the provided arguments
    const Component = ComponentFactory(...factoryArgs)
    
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
