import React, { useState, useEffect, useRef, type ReactNode, type ComponentType } from 'react'

export interface TemplateConfig {
  view: string
  model: Record<string, { type: string; initial: any }>
  methods?: Record<string, string>
  imports?: Array<Record<string, string>>
  unsafeEval?: boolean
}

// Iframe sandbox manager for safe code evaluation
class IframeSandbox {
  private iframe: HTMLIFrameElement | null = null
  private ready: boolean = false
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map()
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
    
    // Initialize sandbox with evaluation code using srcdoc attribute
    // This avoids cross-origin issues when accessing the iframe's document
    const sandboxHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body>
  <script>
    window.addEventListener('message', function(event) {
      // Accept messages from parent (sandbox has null origin, so we can't check origin)
      // In production, you'd want additional validation here
      if (!event.data || event.data.type !== 'SANDBOX_EVAL') {
        return;
      }
      
      const { type, id, code, context } = event.data;
      
      if (type === 'SANDBOX_EVAL') {
        try {
          // Create context object
          const contextObj = {};
          if (context) {
            Object.keys(context).forEach(key => {
              // Only set valid JavaScript identifiers
              if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
                contextObj[key] = context[key];
              }
            });
          }
          
          // Get parameter names
          const paramNames = Object.keys(contextObj);
          
          // Evaluate expression in sandbox
          const func = new Function(...paramNames, \`return \${code}\`);
          const result = func(...paramNames.map(name => contextObj[name]));
          
          // Send result back
          window.parent.postMessage({
            type: 'SANDBOX_RESULT',
            id: id,
            result: result,
            error: null
          }, '*');
        } catch (error) {
          // Send error back with context info for debugging
          const availableKeys = context ? Object.keys(context).filter(k => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)) : [];
          const errorMsg = error.message + ' (Available context keys: ' + availableKeys.join(', ') + ')';
          window.parent.postMessage({
            type: 'SANDBOX_RESULT',
            id: id,
            result: null,
            error: errorMsg
          }, '*');
        }
      }
    });
    
    // Signal that sandbox is ready
    window.parent.postMessage({
      type: 'SANDBOX_READY'
    }, '*');
  </script>
</body>
</html>`

    // Use srcdoc attribute to set HTML content (avoids cross-origin document access)
    this.iframe.srcdoc = sandboxHTML
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
  }

  async evaluate(code: string, context: Record<string, any>): Promise<any> {
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
            this.sendEvaluationRequest(code, context, resolve, reject)
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

      this.sendEvaluationRequest(code, context, resolve, reject)
    })
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

// Singleton sandbox instance
let sandboxInstance: IframeSandbox | null = null

function getSandbox(): IframeSandbox {
  if (!sandboxInstance) {
    sandboxInstance = new IframeSandbox()
  }
  return sandboxInstance
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

// Evaluate expression using either direct eval or sandbox
async function evaluateExpressionAsync(
  expr: string,
  context: Record<string, any>,
  unsafeEval: boolean,
  methods?: Record<string, Function>
): Promise<any> {
  try {
    expr = expr.trim()
    
    // Check if expression is a simple method reference (just an identifier)
    // Methods can't be serialized to sandbox, so handle them on main thread
    if (methods && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr) && methods[expr]) {
      // This is a direct method reference, return the method function
      return methods[expr]
    }
    
    if (unsafeEval) {
      // Direct evaluation using new Function
      const paramNames = Object.keys(context).filter(key => 
        /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      )
      const func = new Function(...paramNames, `return ${expr}`)
      const paramValues = paramNames.map(name => context[name])
      return func(...paramValues)
    } else {
      // Use iframe sandbox
      const sandbox = getSandbox()
      return await sandbox.evaluate(expr, context)
    }
  } catch (error) {
    console.error(`Error evaluating expression "${expr}":`, error)
    return undefined
  }
}

// Convert DOM nodes to React elements using DOMParser
function parseTemplate(
  template: string,
  _model: Record<string, any>, // Unused - expressions are pre-evaluated
  _methods: Record<string, Function>, // Unused - expressions are pre-evaluated
  imports: Record<string, any>,
  _unsafeEval: boolean = true, // Unused - expressions are pre-evaluated
  expressionResults?: Map<string, any>
): ReactNode {

  // Evaluate expressions in {expression} syntax
  // All expressions are now pre-evaluated asynchronously, so we just look up results
  function evaluateExpression(expr: string): any {
    if (expressionResults) {
      // Use pre-evaluated results (works for both unsafeEval modes)
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
      
      // Handle fragments (<>)
      if (tagName === 'fragment') {
        const children: ReactNode[] = []
        Array.from(element.childNodes).forEach((child, idx) => {
          const childNode = domToReact(child, idx)
          if (childNode !== null) {
            children.push(childNode)
          }
        })
        return React.createElement(React.Fragment, { key }, ...children)
      }

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
  // Replace <> fragments with a wrapper element since DOMParser doesn't support fragments
  const wrappedTemplate = template.trim().startsWith('<>') 
    ? `<fragment>${template.trim().slice(2, -2)}</fragment>`
    : template.trim()

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(wrappedTemplate, 'text/html')
    
    // Get the body content (DOMParser wraps in html/body)
    const body = doc.body
    if (!body || body.children.length === 0) {
      return null
    }

    // If we wrapped in a fragment, get the fragment element's children
    // Otherwise, get body's children directly
    let nodesToProcess: NodeList
    if (body.children.length === 1 && body.children[0].tagName === 'FRAGMENT') {
      nodesToProcess = body.children[0].childNodes
    } else {
      nodesToProcess = body.childNodes
    }

    // Convert all children to React elements
    const children: ReactNode[] = []
    Array.from(nodesToProcess).forEach((node, idx) => {
      const reactNode = domToReact(node, idx)
      if (reactNode !== null && reactNode !== undefined) {
        children.push(reactNode)
      }
    })

    return children.length === 1 ? children[0] : React.createElement(React.Fragment, null, ...children)
  } catch (error) {
    console.error('Error parsing template with DOMParser:', error)
    return null
  }
}

// Compile a template config into a React component
export function compileTemplate(config: TemplateConfig): ComponentType {
  return function CompiledTemplate() {
    const [model, setModel] = useState<Record<string, any>>({})
    const [methods, setMethods] = useState<Record<string, Function>>({})
    const [imports, setImports] = useState<Record<string, any>>({})
    const [expressionResults, setExpressionResults] = useState<Map<string, any>>(new Map())
    const modelRef = useRef(model)
    const unsafeEval = config.unsafeEval !== false // default to true
    
    // Keep ref in sync with model
    useEffect(() => {
      modelRef.current = model
    }, [model])

    // Initialize model from config
    useEffect(() => {
      const initialModel: Record<string, any> = {}

      if (config.model) {
        Object.keys(config.model).forEach((key) => {
          initialModel[key] = config.model[key].initial
        })
      }

      setModel(initialModel)
    }, [config.model])

    // Parse methods - they receive (model, setModel)
    useEffect(() => {
      if (config.methods && Object.keys(model).length > 0) {
        const parsedMethods: Record<string, Function> = {}
        Object.keys(config.methods).forEach((methodName) => {
          const methodStr = config.methods![methodName]
          try {
            if (unsafeEval) {
              // Direct evaluation using new Function
              parsedMethods[methodName] = () => {
                const currentModel = modelRef.current
                const methodFunc = new Function(
                  'model',
                  'setModel',
                  `return ${methodStr}`
                )(currentModel, setModel)
                methodFunc(currentModel, setModel)
              }
            } else {
              // For sandbox mode, methods present a challenge: setModel is a React state setter
              // function that cannot be serialized and passed to the sandbox via postMessage.
              // 
              // Options:
              // 1. Use unsafe eval for methods (they're trusted config) - current approach
              // 2. Implement message-passing proxy for setModel - more complex but fully sandboxed
              //
              // For now, we use option 1: methods are part of the trusted config, so we allow
              // unsafe eval for them. In a production system, you'd implement option 2 with
              // a proper message-passing system where the sandbox sends update requests
              // that the main thread processes.
              parsedMethods[methodName] = () => {
                const currentModel = modelRef.current
                // Note: Using unsafe eval for methods even in sandbox mode
                // because they're trusted config and need access to setModel
                const methodFunc = new Function(
                  'model',
                  'setModel',
                  `return ${methodStr}`
                )(currentModel, setModel)
                methodFunc(currentModel, setModel)
              }
            }
          } catch (error) {
            console.error(`Error parsing method ${methodName}:`, error)
          }
        })
        setMethods(parsedMethods)
      }
    }, [model, config.methods, unsafeEval])

    // Handle imports - use dynamic imports for components
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
              // Component name with .tsx extension - import from src/components/
              // Remove .tsx extension if present
              const componentName = path.replace(/\.tsx$/, '')
              // Since we're in src/services/, go up one level to src/, then into components/
              const componentPath = `../components/${componentName}`
              
              importPromises.push(
                import(componentPath).then((module: any) => {
                  const component = module.default || module
                  // Store by the key (PascalCase) and also by kebab-case for template matching
                  importMap[key] = component
                  importMap[toKebabCase(key)] = component
                }).catch((error) => {
                  console.error(`Failed to import component "${componentName}" from components/ for key "${key}":`, error)
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
      // Wait for model to be initialized and imports to be loaded (if any)
      const hasModel = Object.keys(model).length > 0
      const hasImports = !config.imports || Object.keys(imports).length > 0
      
      if (hasModel && hasImports) {
        const evaluateExpressions = async () => {
          const expressions = extractExpressions(config.view)
          if (expressions.length === 0) {
            setExpressionResults(new Map())
            return
          }

          // Build context - only include serializable values
          const context: Record<string, any> = {}
          
          // Add model values (primitives, should be serializable)
          Object.keys(model).forEach(key => {
            context[key] = model[key]
          })
          
          // Add imports (strings, components - components are functions so will be filtered)
          Object.keys(imports).forEach(key => {
            context[key] = imports[key]
          })
          
          // Debug: log context keys
          if (!unsafeEval) {
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
                // Pass methods so method references can be handled on main thread
                const result = await evaluateExpressionAsync(expr, context, unsafeEval, methods)
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
    }, [config.view, model, methods, imports, unsafeEval])

    // Don't render if methods are defined but not yet parsed
    if (config.methods && Object.keys(methods).length === 0 && Object.keys(model).length > 0) {
      return React.createElement('div', null, 'Loading methods...')
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
    if (Object.keys(model).length > 0) {
      const expressions = extractExpressions(config.view)
      if (expressions.length > 0) {
        const allEvaluated = expressions.every(expr => expressionResults.has(expr))
        if (!allEvaluated) {
          return React.createElement('div', null, 'Evaluating expressions...')
        }
      }
    }

    const rendered = parseTemplate(config.view, model, methods, imports, unsafeEval, expressionResults)

    return React.createElement(React.Fragment, null, rendered)
  }
}

