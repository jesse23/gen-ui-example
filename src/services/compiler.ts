import React, { useState, useEffect, useRef, type ReactNode, type ComponentType } from 'react'
import { loadComponent } from './components'

// Engine type constants
export const ENGINE_TYPES = {
  INLINE: 'inline',
  SANDBOX: 'sandbox'
} as const

export type EngineType = typeof ENGINE_TYPES[keyof typeof ENGINE_TYPES]

export interface TemplateConfig {
  view: string
  data: Record<string, { type: string; initial: any }>
  actions?: Record<string, string>
  imports?: Array<Record<string, string>>
  engineType?: EngineType
}

// JavaScript engine interface for evaluating expressions and executing actions
export interface JSEngine {
  evaluateExpression(expr: string, context: Record<string, any>): Promise<any>
  executeAction(
    code: string,
    data: Record<string, any>,
    setData: (update: any) => void
  ): Promise<void>
}

// Inline JavaScript engine - uses direct evaluation with new Function
class InlineJsEngine implements JSEngine {
  async evaluateExpression(expr: string, context: Record<string, any>): Promise<any> {
    try {
      expr = expr.trim()
      const paramNames = Object.keys(context).filter(key => 
        /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      )
      const func = new Function(...paramNames, `return ${expr}`)
      const paramValues = paramNames.map(name => context[name])
      return func(...paramValues)
    } catch (error) {
      console.error(`Error evaluating expression "${expr}":`, error)
      return undefined
    }
  }

  async executeAction(
    code: string,
    data: Record<string, any>,
    setData: (update: any) => void
  ): Promise<void> {
    try {
      const paramNames = ['data', 'setData']
      const paramValues = [data, setData]
      
      const actionFunc = new Function(...paramNames, `return ${code}`)(...paramValues)
      actionFunc(...paramValues)
    } catch (error) {
      console.error(`Error executing action:`, error)
      throw error
    }
  }
}

// Iframe sandbox manager for safe code evaluation
class IframeSandbox implements JSEngine {
  private iframe: HTMLIFrameElement | null = null
  private ready: boolean = false
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map()
  private methodCallbacks: Map<number, Record<string, (...args: any[]) => void>> = new Map()
  private requestId: number = 0
  private messageHandler: (event: MessageEvent) => void

  constructor() {
    this.messageHandler = this.handleMessage.bind(this)
    this.initialize()
  }

  private initialize() {
    // Create iframe with sandbox attribute for null origin isolation
    this.iframe = document.createElement('iframe')
    this.iframe.setAttribute('sandbox', 'allow-scripts')
    this.iframe.style.display = 'none'
    
    // Load sandbox from external file to comply with CSP script-src 'self'
    // The sandbox.html file loads sandbox.js which contains the evaluation logic
    // This avoids inline scripts which are blocked by strict CSP
    this.iframe.src = '/sandbox.html'
    document.body.appendChild(this.iframe)

    // Set up message listener
    window.addEventListener('message', this.messageHandler)
  }

  private handleMessage(event: MessageEvent) {
    if (event.data.type === 'SANDBOX_READY') {
      this.ready = true
      return
    }

    if (event.data.type === 'SANDBOX_RESULT') {
      const { id, result, error } = event.data
      const request = this.pendingRequests.get(id)
      if (request) {
        this.pendingRequests.delete(id)
        if (error) {
          request.reject(new Error(error))
        } else {
          request.resolve(result)
        }
      }
    }

    if (event.data.type === 'SANDBOX_INVOKE_HOST') {
      // Handle generic callback invocations from sandbox
      // This allows any function in the sandbox to communicate with the host via postMessage
      const { id, callbackName, args } = event.data
      const callbacks = this.methodCallbacks.get(id)
      if (callbacks && callbacks[callbackName]) {
        // Call the appropriate callback with the provided arguments
        callbacks[callbackName](...args)
      }
    }

    if (event.data.type === 'SANDBOX_ACTION_RESULT') {
      const { id, error } = event.data
      const request = this.pendingRequests.get(id)
      if (request) {
        this.pendingRequests.delete(id)
        this.methodCallbacks.delete(id) // Clean up callback
        if (error) {
          request.reject(new Error(error))
        } else {
          request.resolve(null) // Action execution completed
        }
      }
    }
  }

  async evaluateExpression(expr: string, context: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.iframe || !this.iframe.contentWindow) {
        reject(new Error('Sandbox iframe not initialized'))
        return
      }

      // Wait for sandbox to be ready
      if (!this.ready) {
        const checkReady = setInterval(() => {
          if (this.ready) {
            clearInterval(checkReady)
            this.sendEvaluationRequest(expr, context, resolve, reject)
          }
        }, 10)
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkReady)
          if (!this.ready) {
            reject(new Error('Sandbox initialization timeout'))
          }
        }, 5000)
        return
      }

      this.sendEvaluationRequest(expr, context, resolve, reject)
    })
  }

  async executeAction(
    code: string,
    data: Record<string, any>,
    setData: (update: any) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.iframe || !this.iframe.contentWindow) {
        reject(new Error('Sandbox iframe not initialized'))
        return
      }

      // Wait for sandbox to be ready
      if (!this.ready) {
        const checkReady = setInterval(() => {
          if (this.ready) {
            clearInterval(checkReady)
            this.sendActionExecutionRequest(code, data, setData, resolve, reject)
          }
        }, 10)
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkReady)
          if (!this.ready) {
            reject(new Error('Sandbox initialization timeout'))
          }
        }, 5000)
        return
      }

      this.sendActionExecutionRequest(code, data, setData, resolve, reject)
    })
  }

  private sendActionExecutionRequest(
    actionCode: string,
    data: Record<string, any>,
    setData: (update: any) => void,
    resolve: () => void,
    reject: (error: any) => void
  ) {
    const id = this.requestId++
    this.pendingRequests.set(id, { resolve, reject })
    // Store setData callback for state updates
    this.methodCallbacks.set(id, { setData })

    // Serialize data (should be serializable)
    const serializableData: Record<string, any> = {}
    Object.keys(data).forEach(key => {
      const value = data[key]
      if (typeof value === 'function' || typeof value === 'symbol') {
        return // Skip non-serializable
      }
      serializableData[key] = value
    })

    this.iframe!.contentWindow!.postMessage(
      {
        type: 'SANDBOX_ACTION_EVAL',
        id,
        actionCode,
        data: serializableData
      },
      '*'
    )

    // Timeout after 10 seconds
    setTimeout(() => {
      if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id)
        this.methodCallbacks.delete(id) // Clean up callback
        reject(new Error('Action execution timeout'))
      }
    }, 10000)
  }

  private sendEvaluationRequest(
    code: string,
    context: Record<string, any>,
    resolve: (value: any) => void,
    reject: (error: any) => void
  ) {
    const id = this.requestId++
    this.pendingRequests.set(id, { resolve, reject })

    // Serialize context - postMessage uses structured cloning
    // Filter out non-serializable values (functions, symbols, etc.)
    const serializableContext: Record<string, any> = {}
    Object.keys(context).forEach(key => {
      const value = context[key]
      
      // Skip functions (can't be serialized via postMessage)
      if (typeof value === 'function') {
        return
      }
      
      // Skip symbols
      if (typeof value === 'symbol') {
        return
      }
      
      // All other types should be serializable via structured cloning
      // (primitives, plain objects, arrays, etc.)
      serializableContext[key] = value
    })

    this.iframe!.contentWindow!.postMessage(
      {
        type: 'SANDBOX_EVAL',
        id,
        code,
        context: serializableContext
      },
      '*'
    )

    // Timeout after 10 seconds
    setTimeout(() => {
      if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id)
        reject(new Error('Evaluation timeout'))
      }
    }, 10000)
  }

  destroy() {
    if (this.iframe && this.iframe.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe)
    }
    window.removeEventListener('message', this.messageHandler)
    this.iframe = null
    this.ready = false
  }
}

// Singleton engine instances
const engineInstances: Map<EngineType, JSEngine> = new Map()

// Engine type map
const engineMap: Record<EngineType, () => JSEngine> = {
  [ENGINE_TYPES.INLINE]: () => new InlineJsEngine(),
  [ENGINE_TYPES.SANDBOX]: () => new IframeSandbox()
}

// Factory function to get the appropriate JS engine based on engineType
function getJSEngine(engineType: EngineType = ENGINE_TYPES.INLINE): JSEngine {
  if (!engineInstances.has(engineType)) {
    const engine = engineMap[engineType]()
    engineInstances.set(engineType, engine)
  }
  return engineInstances.get(engineType)!
}

// Convert kebab-case to PascalCase for component names
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

// Convert PascalCase to kebab-case
function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '') // Remove leading dash if present
}

// Convert HTML attribute names to React prop names
function toReactPropName(attrName: string): string {
  // Special cases
  if (attrName === 'class') return 'className'
  if (attrName === 'for') return 'htmlFor'
  
  // Convert event handlers: onclick -> onClick, onchange -> onChange, etc.
  if (attrName.startsWith('on') && attrName.length > 2) {
    return 'on' + attrName.charAt(2).toUpperCase() + attrName.slice(3)
  }
  
  // Convert other attributes: data-* and aria-* stay as-is
  if (attrName.startsWith('data-') || attrName.startsWith('aria-')) {
    return attrName
  }
  
  // Convert kebab-case to camelCase: tab-index -> tabIndex
  if (attrName.includes('-')) {
    return attrName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
  }
  
  return attrName
}

// Extract all expressions from template for pre-evaluation
function extractExpressions(template: string): string[] {
  const expressions: Set<string> = new Set()
  
  // Extract expressions from text content {expression}
  let textIndex = 0
  while (textIndex < template.length) {
    const exprStart = template.indexOf('{', textIndex)
    if (exprStart === -1) break
    const exprEnd = template.indexOf('}', exprStart)
    if (exprEnd === -1) break
    const expr = template.substring(exprStart + 1, exprEnd).trim()
    if (expr) {
      expressions.add(expr)
    }
    textIndex = exprEnd + 1
  }
  
  // Extract expressions from attributes (e.g., attr="{expression}")
  const attrExprRegex = /="\{([^}]+)\}"/g
  let match
  while ((match = attrExprRegex.exec(template)) !== null) {
    const expr = match[1].trim()
    if (expr) {
      expressions.add(expr)
    }
  }
  
  return Array.from(expressions)
}

// Evaluate expression using the appropriate JS engine
async function evaluateExpressionAsync(
  expr: string,
  context: Record<string, any>,
  engineType: EngineType,
  actions?: Record<string, Function>
): Promise<any> {
  try {
    expr = expr.trim()
    
    // Check if expression is a simple action reference (just an identifier)
    // Actions can't be serialized to sandbox, so handle them on main thread
    if (actions && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr) && actions[expr]) {
      // This is a direct action reference, return the action function
      return actions[expr]
    }
    
    // Use the appropriate engine based on engineType
    const engine = getJSEngine(engineType)
    return await engine.evaluateExpression(expr, context)
  } catch (error) {
    console.error(`Error evaluating expression "${expr}":`, error)
    return undefined
  }
}

// Convert DOM nodes to React elements using DOMParser
function parseTemplate(
  template: string,
  _data: Record<string, any>, // Unused - expressions are pre-evaluated
  _actions: Record<string, Function>, // Unused - expressions are pre-evaluated
  imports: Record<string, any>,
  _engineType: EngineType, // Unused - expressions are pre-evaluated
  expressionResults?: Map<string, any>
): ReactNode {

  // Evaluate expressions in {expression} syntax
  // All expressions are now pre-evaluated asynchronously, so we just look up results
  function evaluateExpression(expr: string): any {
    if (expressionResults) {
      // Use pre-evaluated results (works for both engine types)
      return expressionResults.get(expr) ?? undefined
    }
    // Fallback if results not ready yet
    return undefined
  }

  // Convert DOM node to React element
  function domToReact(node: Node, key: number = 0): ReactNode {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      // Filter out single character artifacts like "<" or ">" that might come from parsing
      const trimmed = text.trim()
      if (trimmed === '<' || trimmed === '>' || trimmed === '</' || trimmed === '/>') {
        return null
      }
      // Handle expressions in text
      if (text.includes('{')) {
        const parts: ReactNode[] = []
        let textIndex = 0
        while (textIndex < text.length) {
          const exprStart = text.indexOf('{', textIndex)
          if (exprStart === -1) {
            parts.push(text.substring(textIndex))
            break
          }
          if (exprStart > textIndex) {
            parts.push(text.substring(textIndex, exprStart))
          }
          const exprEnd = text.indexOf('}', exprStart)
          if (exprEnd === -1) break
          const expr = text.substring(exprStart + 1, exprEnd)
          const evaluated = evaluateExpression(expr)
          if (typeof evaluated !== 'function') {
            parts.push(evaluated == null ? '' : String(evaluated))
          } else {
            parts.push('')
          }
          textIndex = exprEnd + 1
        }
        return React.createElement(React.Fragment, { key }, ...parts)
      }
      return text || null
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      const tagName = element.tagName.toLowerCase()
      
      // Note: Fragments are now handled implicitly at the root level
      // No need to handle <fragment> tags here

      // Parse attributes
      const attrs: Record<string, any> = {}
      Array.from(element.attributes).forEach((attr) => {
        const reactName = toReactPropName(attr.name)
        let value: any = attr.value
        
        // Check if value contains {expression}
        if (value.startsWith('{') && value.endsWith('}')) {
          const expr = value.slice(1, -1)
          value = evaluateExpression(expr)
        }
        
        attrs[reactName] = value
      })

      // Check if it's a component (has hyphen or is a known import)
      const isComponent = tagName.includes('-') || imports[tagName] !== undefined
      let Component: any = tagName
      if (isComponent) {
        // Try to find component: first by kebab-case, then convert to PascalCase
        Component = imports[tagName] || imports[toPascalCase(tagName)]
        // Check if Component is actually a function/component (not a string path)
        if (!Component || typeof Component === 'string' || typeof Component !== 'function') {
          // For kebab-case tags that aren't found, we can't render them as HTML tags
          if (tagName.includes('-')) {
            console.warn(`Component "${tagName}" not found or not loaded yet. Available imports:`, Object.keys(imports), 'Component value:', Component)
            // Return null if component isn't ready yet
            return null
          }
          Component = tagName
        }
      }

      // Parse children
      const children: ReactNode[] = []
      Array.from(element.childNodes).forEach((child, idx) => {
        const childNode = domToReact(child, idx)
        if (childNode !== null && typeof childNode !== 'function') {
          children.push(childNode)
        }
      })

      return React.createElement(Component, { ...attrs, key }, ...children)
    }

    return null
  }

  // Use DOMParser to parse the template
  // Support multiple root nodes - automatically wrap in Fragment if needed
  const trimmedTemplate = template.trim()

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(trimmedTemplate, 'text/html')
    
    // Get the body content (DOMParser wraps in html/body)
    const body = doc.body
    if (!body || body.children.length === 0) {
      return null
    }

    // Process all root-level children (supports multiple root nodes)
    const children: ReactNode[] = []
    Array.from(body.children).forEach((node, idx) => {
      const reactNode = domToReact(node, idx)
      if (reactNode !== null && reactNode !== undefined) {
        children.push(reactNode)
      }
    })

    // If there's only one root node, return it directly
    // If there are multiple root nodes, wrap them in a Fragment
    return children.length === 1 ? children[0] : React.createElement(React.Fragment, null, ...children)
  } catch (error) {
    console.error('Error parsing template with DOMParser:', error)
    return null
  }
}

// Compile a template config into a React component
export function compileTemplate(config: TemplateConfig): ComponentType {
  return function CompiledTemplate() {
    const [data, setData] = useState<Record<string, any>>({})
    const [actions, setActions] = useState<Record<string, Function>>({})
    const [imports, setImports] = useState<Record<string, any>>({})
    const [expressionResults, setExpressionResults] = useState<Map<string, any>>(new Map())
    const dataRef = useRef(data)
    const engineType = config.engineType || ENGINE_TYPES.INLINE // default to inline
    
    // Keep ref in sync with data
    useEffect(() => {
      dataRef.current = data
    }, [data])

    // Initialize data from config
    useEffect(() => {
      const initialData: Record<string, any> = {}

      if (config.data) {
        Object.keys(config.data).forEach((key) => {
          initialData[key] = config.data[key].initial
        })
      }

      setData(initialData)
    }, [config.data])

    // Parse actions - they receive (data, setData)
    useEffect(() => {
      if (config.actions && Object.keys(data).length > 0) {
        const parsedActions: Record<string, Function> = {}
        Object.keys(config.actions).forEach((actionName) => {
          const actionStr = config.actions![actionName]
          try {
            // Use the appropriate engine based on engineType
            // For sandbox mode, callbacks are provided as a map that the sandbox can invoke via postMessage
            // This approach allows any function to communicate with the host via postMessage
            // Note: Updates are applied asynchronously. Side effects that depend on immediate
            // state updates may not work as expected.
            parsedActions[actionName] = async () => {
              const currentData = dataRef.current
              try {
                const engine = getJSEngine(engineType)
                // setData is passed explicitly as a dispatch action
                // Execute action using the engine
                await engine.executeAction(actionStr, currentData, setData)
              } catch (error) {
                console.error(`Error executing action ${actionName}:`, error)
              }
            }
          } catch (error) {
            console.error(`Error parsing action ${actionName}:`, error)
          }
        })
        setActions(parsedActions)
      }
    }, [data, config.actions, engineType])

    // Handle imports - use dynamic imports for code splitting
    useEffect(() => {
      if (config.imports) {
        const importMap: Record<string, any> = {}
        const importPromises: Promise<void>[] = []
        
        config.imports.forEach((imp) => {
          Object.keys(imp).forEach((key) => {
            const path = imp[key]
            if (path.startsWith('/')) {
              // Public asset (like /vite.svg) - just store the path
              importMap[key] = path
            } else {
              // Component name with .tsx extension - dynamically import from registry
              // Remove .tsx extension if present and convert to PascalCase
              const componentName = path.replace(/\.tsx$/, '')
              const pascalComponentName = toPascalCase(componentName)
              const pascalKey = toPascalCase(key)
              
              importPromises.push(
                loadComponent(pascalComponentName)
                  .then((component) => {
                    if (component) {
                      // Store by the key (PascalCase) and also by kebab-case for template matching
                      importMap[key] = component
                      importMap[toKebabCase(key)] = component
                    } else {
                      // Try the key as fallback (also in PascalCase)
                      return loadComponent(pascalKey).then((fallbackComponent) => {
                        if (fallbackComponent) {
                          importMap[key] = fallbackComponent
                          importMap[toKebabCase(key)] = fallbackComponent
                        } else {
                          console.error(`Component "${pascalComponentName}" or "${pascalKey}" not found in registry. Make sure it's registered in src/components/registry.ts`)
                        }
                      })
                    }
                  })
                  .catch((error) => {
                    console.error(`Failed to load component "${pascalComponentName}" for key "${key}":`, error)
                  })
              )
            }
          })
        })
        
        // Wait for all component imports to complete
        Promise.all(importPromises).then(() => {
          setImports(importMap)
        })
      }
    }, [config.imports])

    // Evaluate expressions asynchronously for both modes
    useEffect(() => {
      // Wait for data to be initialized and imports to be loaded (if any)
      const hasData = Object.keys(data).length > 0
      const hasImports = !config.imports || Object.keys(imports).length > 0
      
      if (hasData && hasImports) {
        const evaluateExpressions = async () => {
          const expressions = extractExpressions(config.view)
          if (expressions.length === 0) {
            setExpressionResults(new Map())
            return
          }

          // Build context - only include serializable values
          const context: Record<string, any> = {}
          
          // Add data values (primitives, should be serializable)
          Object.keys(data).forEach(key => {
            context[key] = data[key]
          })
          
          // Add imports (strings, components - components are functions so will be filtered)
          Object.keys(imports).forEach(key => {
            context[key] = imports[key]
          })
          
          // Debug: log context keys
          if (engineType === ENGINE_TYPES.SANDBOX) {
            console.log('Sandbox evaluation context keys:', Object.keys(context))
            console.log('Context values:', Object.keys(context).reduce((acc, key) => {
              acc[key] = typeof context[key]
              return acc
            }, {} as Record<string, string>))
          }

          const results = new Map<string, any>()
          await Promise.all(
            expressions.map(async (expr) => {
              try {
                // Pass actions so action references can be handled on main thread
                const result = await evaluateExpressionAsync(expr, context, engineType, actions)
                results.set(expr, result)
              } catch (error) {
                console.error(`Error evaluating expression "${expr}":`, error)
                results.set(expr, undefined)
              }
            })
          )

          setExpressionResults(results)
        }

        evaluateExpressions()
      }
    }, [config.view, data, actions, imports, engineType])

    // Don't render if actions are defined but not yet parsed
    if (config.actions && Object.keys(actions).length === 0 && Object.keys(data).length > 0) {
      return React.createElement('div', null, 'Loading actions...')
    }

    // Don't render if component imports are still loading
    if (config.imports) {
      const expectedComponentKeys: string[] = []
      config.imports.forEach(imp => {
        Object.keys(imp).forEach(key => {
          const path = imp[key]
          // Component imports don't start with / (those are assets)
          if (!path.startsWith('/')) {
            expectedComponentKeys.push(key) // PascalCase key from YAML
            expectedComponentKeys.push(toKebabCase(key)) // Also check kebab-case version
          }
        })
      })
      // Check if all expected component imports are loaded and are functions
      if (expectedComponentKeys.length > 0) {
        const hasAllImports = expectedComponentKeys.every(key => 
          imports[key] && typeof imports[key] === 'function'
        )
        if (!hasAllImports) {
          return React.createElement('div', null, 'Loading components...')
        }
      }
    }

    // Don't render if expressions are still being evaluated
    if (Object.keys(data).length > 0) {
      const expressions = extractExpressions(config.view)
      if (expressions.length > 0) {
        const allEvaluated = expressions.every(expr => expressionResults.has(expr))
        if (!allEvaluated) {
          return React.createElement('div', null, 'Evaluating expressions...')
        }
      }
    }

    const rendered = parseTemplate(config.view, data, actions, imports, engineType, expressionResults)

    return React.createElement(React.Fragment, null, rendered)
  }
}

