// Dynamic import registry for code splitting
// Each component is dynamically imported so Vite can create separate chunks
// This keeps the main bundle small and loads components on-demand

// Map component names to their dynamic import functions
// Using explicit string literals so Vite can statically analyze and code-split
// All component names must be in PascalCase
export const componentImportMap: Record<string, () => Promise<any>> = {
  ExistWhen: () => import('../components/ExistWhen'),
  DeclComponent: () => import('../components/DeclComponent'),
}

/**
 * Load a component by name.
 * Currently loads from local registry, but can be extended to support remote components.
 * 
 * @param name - Component name in PascalCase (e.g., "ExistWhen")
 * @returns Promise that resolves to the component, or null if not found
 * 
 * @contract
 * - The name parameter must be in PascalCase format
 * - The component must be registered in componentImportMap
 * - Callers are responsible for converting kebab-case to PascalCase if needed
 */
export async function loadComponent(name: string): Promise<any> {
  const importFn = componentImportMap[name]
  if (importFn) {
    const module = await importFn()
    return module.default || module
  }
  
  return null
}

