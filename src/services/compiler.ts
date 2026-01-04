import React, { useState, useEffect, useRef, type ReactNode, type ComponentType } from 'react'

export interface TemplateConfig {
  view: string
  model: Record<string, { type: string; initial: any }>
  methods?: Record<string, string>
  imports?: Array<Record<string, string>>
}

// Convert kebab-case to PascalCase for component names
export function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

// Convert PascalCase to kebab-case
export function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '') // Remove leading dash if present
}

// Convert HTML attribute names to React prop names
export function toReactPropName(attrName: string): string {
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

// Convert DOM nodes to React elements using DOMParser
export function parseTemplate(
  template: string,
  model: Record<string, any>,
  methods: Record<string, Function>,
  imports: Record<string, any>
): ReactNode {

  // Evaluate expressions in {expression} syntax
  function evaluateExpression(expr: string): any {
    try {
      expr = expr.trim()
      
      // Create a context with model, methods, and imports
      const context: Record<string, any> = {
        ...imports,
        ...methods,
        ...model, // Model values take precedence
      }
      
      // Debug: log context for complex expressions
      if (expr.includes('>') || expr.includes('<') || expr.includes('===')) {
        console.log(`Evaluating expression "${expr}" with model:`, model, 'Context keys:', Object.keys(context))
      }

      // Check if it's a simple identifier (just a variable name)
      const simpleIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
      if (simpleIdentifierRegex.test(expr)) {
        // First check model directly (highest priority)
        if (expr in model) {
          const modelValue = model[expr]
          // Model values should never be functions (they're data)
          if (typeof modelValue === 'function') {
            console.error(`Model key "${expr}" is a function, which is invalid.`)
            return undefined
          }
          return modelValue
        }
        // Then check context (for methods, imports)
        if (expr in context) {
          const value = context[expr]
          return value
        }
        // If identifier not found anywhere, return undefined
        return undefined
      }

      // For complex expressions, use Function constructor with context
      // Build parameter list from context keys (only valid JS identifiers)
      const paramNames = Object.keys(context).filter(key => {
        return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      })

      if (paramNames.length === 0) {
        // No valid parameters, can't evaluate
        console.warn('No valid context parameters for expression:', expr, 'Context:', context)
        return undefined
      }

      // Check if all variables in expression are in paramNames
      // Extract variable names from expression (simple heuristic)
      const exprVars = expr.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || []
      const missingVars = exprVars.filter(v => !paramNames.includes(v) && v !== 'true' && v !== 'false' && v !== 'null' && v !== 'undefined')
      if (missingVars.length > 0) {
        console.error(`Expression "${expr}" uses variables not in context:`, missingVars, 'Available:', paramNames, 'Model:', model)
      }

      // Create function that evaluates the expression
      const func = new Function(
        ...paramNames,
        `return ${expr}`
      )

      // Call with context values in same order
      const paramValues = paramNames.map(name => context[name])
      const result = func(...paramValues)
      
      // Debug log for condition expressions
      if (expr.includes('>') || expr.includes('<') || expr.includes('===') || expr.includes('!==')) {
        console.log(`Expression "${expr}" evaluated:`, result, 'Context keys:', paramNames, 'Model:', model, 'count value:', context['count'])
        if (result === undefined) {
          console.error(`Expression "${expr}" returned undefined! Check if all variables are in context.`)
        }
      }
      
      return result
    } catch (error) {
      console.error('Error evaluating expression:', expr, error)
      // Return the expression as-is if evaluation fails
      return expr
    }
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
    const modelRef = useRef(model)
    
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
            // The method string is a function: (model, setModel) => setModel(...)
            parsedMethods[methodName] = () => {
              const currentModel = modelRef.current
              const methodFunc = new Function(
                'model',
                'setModel',
                `return ${methodStr}`
              )(currentModel, setModel)
              methodFunc(currentModel, setModel)
            }
          } catch (error) {
            console.error(`Error parsing method ${methodName}:`, error)
          }
        })
        setMethods(parsedMethods)
      }
    }, [model, config.methods])

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

    const rendered = parseTemplate(config.view, model, methods, imports)

    return React.createElement(React.Fragment, null, rendered)
  }
}

