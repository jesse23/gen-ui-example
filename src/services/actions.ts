// Action registry for UI boundary operations
// Actions handle communication with external systems (server requests, navigation, etc.)

import { toast } from 'sonner'

// JSON Schema type for action parameters (flat Record of param name to schema)
export type JSONSchema = Record<string, any>

// Property shape used by Field / form data (Record<string, Property>)
export interface Property {
  type?: string
  name?: string
  value?: unknown
  placeholder?: string
  readOnly?: boolean
  valid?: boolean
  disabled?: boolean
  description?: string
  options?: { value: string; label: string }[]
}

// Action definition with params (JSON schema) and handler function
export interface ActionDefinition {
  name: string
  description: string
  params?: Record<string, JSONSchema>
  returns?: JSONSchema
  handler?: (...args: any[]) => any | Promise<any>
}

// Map action names to their action definitions
const actionMap: Record<string, ActionDefinition> = {
  submit: {
    name: 'submit',
    description: 'Submit form data or trigger a submission action',
    params: {
      data: {
        type: 'object',
        description: 'Form data as Record<string, Property> (field name -> { type, name, value, placeholder? })'
      }
    },
    handler: async (params: Record<string, Property> | { data?: Record<string, Property> }): Promise<void> => {
      const payload = params && typeof params === 'object' && 'data' in params && params.data != null
        ? params.data
        : (params as Record<string, Property>)
      const filteredPayload = Object.fromEntries(
        Object.entries(payload)
          .filter(([, v]) => {
            if (v == null) return false
            const val = v.value
            return val != null && val !== ''
          })
          .map(([k, v]) => [k, { value: v.value }])
      )
      toast.success('Form submitted successfully!', {
        description: JSON.stringify(filteredPayload, null, 2),
      })
    }
  },
  navigate: {
    name: 'navigate',
    description: 'Navigate to a different URL or route',
    params: {
      url: {
        type: 'string',
        description: 'The URL or route to navigate to'
      }
    },
    handler: (params: { url: string }): void => {
      console.log('Navigating to:', params.url)

      // Show toast notification
      toast.success('Navigating to:', {
        description: params.url,
      })
      // TODO: Implement actual navigation logic
      // For now, this could use window.location or a router
    }
  },
  getValue: {
    name: 'getValue',
    description: 'Get a value with position and weight',
    params: {},
    returns: {
      type: 'object',
      properties: {
        position: {
          type: 'object',
          properties: {
            x: {
              type: 'number',
              description: 'X coordinate'
            },
            y: {
              type: 'number',
              description: 'Y coordinate'
            }
          },
          required: ['x', 'y'],
          description: 'Position coordinates'
        },
        weight: {
          type: 'number',
          description: 'Weight value'
        }
      },
      required: ['position', 'weight']
    },
    handler: async (_params: {}): Promise<{ position: { x: number; y: number }; weight: number }> => {
      return {
        position: { x: 3, y: 5 },
        weight: 7
      }
    }
  },
  plusOne: {
    name: 'plusOne',
    description: 'Increment a numeric value by 1',
    params: {
      value: {
        type: 'number',
        description: 'Input number'
      }
    },
    returns: {
        value: {
          type: 'number',
          description: 'Output number (input + 1)'
        }
    },
    handler: async (params: { value: number }): Promise<{ value: number }> => {
      return { value: params.value + 1 }
    }
  },
}

/**
 * Register an action dynamically.
 * Allows adding actions to the registry at runtime.
 * 
 * @param name - Action name in camelCase (e.g., "submitForm")
 * @param handler - The action handler function
 * @param params - Optional JSON schema for action parameters
 * @param description - Optional description of the action
 * 
 * @example
 * registerAction('submitForm', async (params) => { ... }, { formId: { type: 'string' } })
 */
export function registerAction(
  name: string,
  handler: (...args: any[]) => any | Promise<any>,
  params?: Record<string, JSONSchema>,
  description?: string
): void {
  actionMap[name] = {
    name,
    description: description || `Action: ${name}`,
    params: params || {},
    handler
  }
}

/**
 * Check if an action exists in the registry.
 * 
 * @param name - Action name in camelCase (e.g., "submit")
 * @returns true if action exists in registry, false otherwise
 */
export function hasAction(name: string): boolean {
  return name in actionMap
}

/**
 * Load an action handler by name.
 * 
 * @param name - Action name in camelCase (e.g., "submit")
 * @returns The action handler function, or null if not found
 */
export function loadAction(name: string): ((...args: any[]) => any | Promise<any>) | null {
  const actionDef = actionMap[name]
  if (actionDef) {
    if (!actionDef.handler) {
      console.warn(`Action "${name}" does not have a handler function`)
      return null
    }
    return actionDef.handler
  }

  console.warn(`Action "${name}" not found in registry. Available:`, Object.keys(actionMap))
  return null
}

/**
 * Get all action definitions with their name, description, and params.
 * 
 * @param excludeHandler - If true, excludes the handler function from the returned definitions
 * @returns Array of action definitions
 */
export function getAllActionDefinitions(excludeHandler: boolean = false): ActionDefinition[] {
  const defs = Object.values(actionMap)
  if (excludeHandler) {
    return defs.map(({ handler, ...rest }) => rest)
  }
  return defs
}

/**
 * Get an action definition by name.
 * 
 * @param name - Action name in camelCase (e.g., "submit")
 * @returns The action definition, or null if not found
 */
export function getActionDefinition(name: string): ActionDefinition | null {
  return actionMap[name] || null
}
