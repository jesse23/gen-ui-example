// Dynamic import registry for code splitting
// Each component is dynamically imported so Vite can create separate chunks
// This keeps the main bundle small and loads components on-demand

// JSON Schema type for component parameters (flat Record of prop name to schema)
export type JSONSchema = Record<string, any>

// Component definition with params (JSON schema) and load function
export interface ComponentDefinition {
  name: string
  description: string
  params?: Record<string, JSONSchema>
  load?: () => Promise<any>
}

// Map component names to their component definitions
// Using explicit string literals so Vite can statically analyze and code-split
// All component names must be in PascalCase
const componentImportMap: Record<string, ComponentDefinition> = {
  ExistWhen: {
    name: 'ExistWhen',
    description: 'Conditionally renders children based on a boolean condition',
    params: {
      condition: {
        type: 'boolean',
        description: 'Condition to determine if children should be rendered',
        required: true
      },
      children: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of component IDs (keys) that should be rendered as children when condition is true'
      }
    },
    // @ts-ignore - Dynamic import of TSX file, resolved at runtime by Vite
    load: () => import('./ExistWhen')
  },
  Button: {
    name: 'Button',
    description: 'A versatile button component with multiple variants and sizes for user interactions',
    params: {
      text: {
        type: 'string',
        description: 'The text content to display in the button'
      },
      variant: {
        type: 'string',
        enum: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
        description: 'Visual style variant of the button',
        default: 'default'
      },
      size: {
        type: 'string',
        enum: ['default', 'sm', 'lg', 'icon'],
        description: 'Size of the button',
        default: 'default'
      },
      onClick: {
        type: 'object',
        description: 'Action to perform when button is clicked',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the action to execute'
          },
          params: {
            type: 'object',
            description: 'Parameters to pass to the action'
          }
        },
        required: ['name']
      }
    },
    // @ts-ignore - Dynamic import of TSX file, resolved at runtime by Vite
    load: () => import('./DeclButton')
  },
  Card: {
    name: 'Card',
    description: 'A container component for displaying content in a card layout with header, body, and footer sections',
    params: {
      title: {
        type: 'string',
        description: 'The title text displayed in the card header'
      },
      description: {
        type: 'string',
        description: 'The description text displayed in the card header below the title'
      },
      action: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of component IDs (keys) that should be rendered as action elements in the card header'
      },
      content: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of component IDs (keys) that should be rendered as content inside the card body'
      },
      footer: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of component IDs (keys) that should be rendered as footer elements at the bottom of the card'
      },
      children: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of component IDs (keys) that should be rendered as children inside the card (alternative to content)'
      }
    },
    // @ts-ignore - Dynamic import of TSX file, resolved at runtime by Vite
    load: () => import('./DeclCard')
  },
  Breadcrumb: {
    name: 'Breadcrumb',
    description: 'Navigation breadcrumb component for showing the current page location within a hierarchy',
    params: {
      separator: {
        type: 'string',
        description: 'Custom separator between breadcrumb items'
      }
    },
    // @ts-ignore - Dynamic import of TSX file, resolved at runtime by Vite
    load: () => import('../ui/breadcrumb')
  },
  Input: {
    name: 'Input',
    description: 'A form input field component supporting various input types and form attributes',
    params: {
      type: {
        type: 'string',
        enum: ['text', 'email', 'password', 'number', 'tel', 'url', 'search', 'date', 'time', 'datetime-local'],
        description: 'Input type',
        default: 'text'
      },
      placeholder: {
        type: 'string',
        description: 'Placeholder text'
      }
    },
    // @ts-ignore - Dynamic import of TSX file, resolved at runtime by Vite
    load: () => import('../ui/input')
  },
  Label: {
    name: 'Label',
    description: 'A label component for form inputs, providing accessible labeling for form fields',
    params: {
      text: {
        type: 'string',
        description: 'The text content to display in the label'
      }
    },
    // @ts-ignore - Dynamic import of TSX file, resolved at runtime by Vite
    load: () => import('./DeclLabel')
  },
  Form: {
    name: 'Form',
    description: 'A form component that wraps form elements with onSubmit handling and automatically wraps children with Field components',
    params: {
      onSubmit: {
        type: 'object',
        description: 'Action to perform when form is submitted',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the action to execute'
          },
          params: {
            type: 'object',
            description: 'Parameters to pass to the action (will be merged with form data)'
          }
        },
        required: ['name']
      },
      children: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of component IDs (keys) that should be rendered as children inside the form, each wrapped in a Field component'
      }
    },
    // @ts-ignore - Dynamic import of TSX file, resolved at runtime by Vite
    load: () => import('./DeclForm')
  },
}

/**
 * Register a component dynamically.
 * Allows adding components to the registry at runtime.
 * 
 * @param name - Component name in PascalCase (e.g., "MyComponent")
 * @param component - The component to register
 * @param params - Optional JSON schema for component parameters
 * 
 * @example
 * registerComponent('MyComponent', MyComponent)
 * registerComponent('MyComponent', MyComponent, { propName: { type: 'string', description: '...' } })
 */
export function registerComponent(
  name: string,
  component: any,
  params?: Record<string, JSONSchema>,
  description?: string
): void {
  componentImportMap[name] = {
    name,
    description: description || `Component: ${name}`,
    params: params || {},
    load: () => Promise.resolve(component)
  }
}

/**
 * Check if a component exists in the registry.
 * 
 * @param name - Component name in PascalCase (e.g., "ExistWhen")
 * @returns true if component exists in registry, false otherwise
 */
export function hasComponent(name: string): boolean {
  return name in componentImportMap
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
  const componentDef = componentImportMap[name]
  if (componentDef) {
    if (!componentDef.load) {
      throw new Error(`Component "${name}" does not have a load function`)
    }
    try {
      console.log(`Loading component: ${name}`)
      const module = await componentDef.load()
      // Try default export first, then named export with same name, then the module itself
      let component = module.default
      if (!component && module[name]) {
        component = module[name]
      }
      if (!component && typeof module === 'function') {
        component = module
      }
      if (!component) {
        component = module
      }
      console.log(`Successfully loaded component: ${name}`, component ? 'found' : 'not found')
      return component
    } catch (error) {
      console.error(`Error importing component "${name}":`, error)
      throw error
    }
  }
  
  console.warn(`Component "${name}" not found in registry. Available:`, Object.keys(componentImportMap))
  return null
}

/**
 * Get all component definitions with their name, description, and params.
 * 
 * @param excludeLoad - If true, excludes the load function from the returned definitions
 * @returns Array of component definitions
 */
export function getAllComponentDefinitions(excludeLoad: boolean = false): ComponentDefinition[] {
  const defs = Object.values(componentImportMap)
  if (excludeLoad) {
    return defs.map(({ load, ...rest }) => rest)
  }
  return defs
}

/**
 * Get a component definition by name.
 * 
 * @param name - Component name in PascalCase (e.g., "Card")
 * @returns Component definition or undefined if not found
 */
export function getComponentDefinition(name: string): ComponentDefinition | undefined {
  return componentImportMap[name]
}
