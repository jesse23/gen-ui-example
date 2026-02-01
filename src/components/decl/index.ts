// Dynamic import registry for code splitting
// Each component is dynamically imported so Vite can create separate chunks
// This keeps the main bundle small and loads components on-demand

import {
  type DeclNode,
  type DeclData,
  renderDeclNodes,
  createDataBind,
  createActionBind
} from '../../services/decl'

// JSON Schema type for component parameters (flat Record of prop name to schema)
export type JSONSchema = Record<string, any>

// Render context containing all necessary data for rendering
export interface RenderContext {
  declNodes: Map<string, DeclNode>
  loadedComponents: Map<string, any>
  loadedActions: Map<string, (...args: any[]) => any>
  dataStore: DeclData
  setDataStore: (updater: (prev: DeclData) => DeclData) => void
}

/**
 * Resolves DECL-shaped props (e.g. child keys, action configs) into the props
 * the underlying React component expects (e.g. rendered nodes, callbacks).
 * Optional per-component adapter; omit when DECL params match component props.
 */
export type ResolvePropsCallback = (
  props: Record<string, any>,
  context: RenderContext
) => Record<string, any>

// Component definition with params (JSON schema) and load function
export interface ComponentDefinition {
  name: string
  description: string
  params?: Record<string, JSONSchema>
  load?: () => Promise<any>
  /** Resolve DECL props to component props (keys → nodes, action configs → handlers). Optional. */
  resolveProps?: ResolvePropsCallback
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
    load: () => import('../react/ExistWhen'),
    // Process props: convert children array from keys to rendered nodes
    resolveProps: (props, context) => {
      const processed = { ...props }

      if (Array.isArray(processed.children)) {
        const childrenKeys = processed.children.filter((c): c is string => typeof c === 'string')
        processed.children = renderDeclNodes(childrenKeys, context)
      }

      return processed
    }
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
    load: () => import('./Button'),
    // Process props: bind onClick action
    resolveProps: (props, context) => {
      const processed = { ...props }
      const onClick = createActionBind(processed.onClick, context)
      if (onClick) processed.onClick = onClick
      else if (processed.onClick != null) delete processed.onClick
      return processed
    }
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
    load: () => import('../react/DeclCard'),
    // Process props: convert action, content, footer, and children arrays from keys to rendered nodes
    resolveProps: (props, context) => {
      const processed = { ...props }

      if (Array.isArray(processed.action)) {
        const actionKeys = processed.action.filter((c): c is string => typeof c === 'string')
        processed.action = renderDeclNodes(actionKeys, context)
      }

      if (Array.isArray(processed.content)) {
        const contentKeys = processed.content.filter((c): c is string => typeof c === 'string')
        processed.content = renderDeclNodes(contentKeys, context)
      }

      if (Array.isArray(processed.footer)) {
        const footerKeys = processed.footer.filter((c): c is string => typeof c === 'string')
        processed.footer = renderDeclNodes(footerKeys, context)
      }

      if (Array.isArray(processed.children)) {
        const childrenKeys = processed.children.filter((c): c is string => typeof c === 'string')
        processed.children = renderDeclNodes(childrenKeys, context)
      }

      return processed
    }
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
    load: () => import('./Label')
  },
  TextBox: {
    name: 'TextBox',
    description: 'A text input field component with two-way data binding support via dataBind prop',
    params: {
      dataBind: {
        type: 'string',
        description: 'Dot-separated path in the data store to bind this input to (e.g., "user.name", "form.email"). This automatically provides value and onChange for two-way binding.'
      },
      placeholder: {
        type: 'string',
        description: 'Placeholder text displayed when the input is empty'
      },
      type: {
        type: 'string',
        enum: ['text', 'email', 'password', 'number', 'tel', 'url', 'search', 'date', 'time', 'datetime-local'],
        description: 'Input type',
        default: 'text'
      },
      className: {
        type: 'string',
        description: 'Additional CSS classes to apply to the input'
      }
    },
    // @ts-ignore - Dynamic import of TSX file, resolved at runtime by Vite
    load: () => import('./TextBox'),
    // Process props: handle dataBind prop and convert to value/onChange
    resolveProps: (props, context) => {
      const processed = { ...props }

      // Handle dataBind prop - convert to value and onChange
      if (processed.dataBind && typeof processed.dataBind === 'string') {
        const path = processed.dataBind as string
        const binding = createDataBind(path, context)
        const bound = binding.get()
        // If the store holds a Property object (e.g. { type, name, value, placeholder }), bind to .value so the input shows the scalar, not "[object Object]"
        const valuePath =
          bound != null &&
            typeof bound === 'object' &&
            !Array.isArray(bound) &&
            'value' in bound
            ? `${path}.value`
            : path
        const valueBinding =
          valuePath !== path ? createDataBind(valuePath, context) : binding
        processed.value = valueBinding.get()
        // When bound to a Property object: use property.name for label, property.placeholder for placeholder (not name in placeholder)
        if (valuePath !== path && bound != null && typeof bound === 'object' && 'name' in bound) {
          processed.label = (bound as { name?: string }).name
          if ((bound as { placeholder?: string }).placeholder != null) {
            processed.placeholder = (bound as { placeholder?: string }).placeholder
          }
        }
        // Wrap setter to extract value from event if it's a React event object
        processed.onChange = (e: any) => {
          const value = e?.target?.value !== undefined ? e.target.value : e
          valueBinding.set(value)
        }
        // Remove dataBind prop as it's DECL-specific and not needed by component
        delete processed.dataBind
      }

      return processed
    }
  },
  Field: {
    name: 'Field',
    description: 'A form field driven by a Property in the store. dataBind is the dot-separated path to that Property object (e.g. "form.fields.email"). The store at that path must hold { type, name, value, readOnly?, valid?, disabled?, placeholder?, description?, options? }. Value updates write back to property.value at the same path.',
    params: {
      dataBind: {
        type: 'string',
        description: 'Dot-separated path in the data store to a Property object (e.g. "form.fields.email"). The object must have type, name, and value; optional: readOnly, valid, disabled, placeholder, description, options.'
      },
      id: { type: 'string', description: 'Optional id for the control (defaults to generated from property.name)' },
      className: { type: 'string', description: 'Additional CSS classes for the field wrapper' }
    },
    // @ts-ignore - Dynamic import of TSX file, resolved at runtime by Vite
    load: () => import('./Field'),
    resolveProps: (props, context) => {
      const processed = { ...props }
      const dataBind = processed.dataBind as string | undefined
      if (dataBind && typeof dataBind === 'string') {
        const binding = createDataBind(dataBind, context)
        const property = binding.get()
        processed.property =
          property != null && typeof property === 'object'
            ? { ...property }
            : { type: 'text', name: '', value: undefined }
        const valueBinding = createDataBind(`${dataBind}.value`, context)
        processed.onChange = (value: unknown) => valueBinding.set(value)
        delete processed.dataBind
      }
      return processed
    }
  },
  Form: {
    name: 'Form',
    description: 'A form component that wraps form elements and renders children (use a Button with onClick for submit action)',
    params: {
      children: {
        type: 'array',
        items: {
          type: 'string'
        },
        description: 'Array of component IDs (keys) that should be rendered as children inside the form'
      }
    },
    // @ts-ignore - Dynamic import of TSX file, resolved at runtime by Vite
    load: () => import('../react/DeclForm'),
    resolveProps: (props, context) => {
      let processed = { ...props }
      if (Array.isArray(processed.children)) {
        const childrenKeys = processed.children.filter((c): c is string => typeof c === 'string')
        processed.children = renderDeclNodes(childrenKeys, context)
      }
      return processed
    }
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

/**
 * Load all components from the component registry.
 * Returns a Map of component name to loaded component (for use in RenderContext.loadedComponents).
 */
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
