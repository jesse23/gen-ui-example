/**
 * Template Compiler Service
 * 
 * This module provides a unified API for compiling component definitions (YAML templates)
 * into React components. It supports three compilation strategies:
 * 
 * 1. INLINE: Direct evaluation using JavaScript's Function constructor
 *    - Fast, but less secure (runs in main thread)
 *    - Good for trusted templates
 * 
 * 2. SANDBOX: Isolated evaluation in an iframe sandbox
 *    - More secure, isolated execution context
 *    - Uses postMessage for communication
 *    - Good for untrusted templates
 * 
 * 3. BLOB: Static compilation to JavaScript blob
 *    - Pre-compiles template to JavaScript code
 *    - All expressions are inlined at compile time
 *    - No runtime expression evaluation
 *    - Best performance, but requires blob URL support
 * 
 * Function Call Tree:
 * ===================
 * 
 * compileTemplate (exported main API)
 *   ├─> compileTemplateToJsBlobComponent (if compilationStrategy === BLOB)
 *   │    ├─> compileTemplateToJS
 *   │    │    ├─> toPascalCase (helper)
 *   │    │    └─> toReactPropName (helper)
 *   │    ├─> Creates blob and imports it
 *   │    └─> createCompiledComponent (from blob)
 *   │         └─> createComponent (component helper)
 *   │              └─> (via pre-compiled callbacks from blob code)
 *   │                   ├─> renderTemplate callback (pre-compiled JS code)
 *   │                   └─> parseActions callback (pre-compiled JS code)
 *   │                   (no evaluateExpressions - expressions are pre-compiled)
 *   │
 *   └─> compileTemplateToInlineComponent (if compilationStrategy === INLINE | SANDBOX)
 *        └─> createComponent (component helper)
 *             └─> (via callbacks passed to createComponent)
 *                  ├─> renderTemplate callback (inline template parsing)
 *                  │    ├─> toReactPropName (helper)
 *                  │    └─> toPascalCase (helper)
 *                  ├─> parseActions callback
 *                  │    └─> getJSEngine -> engine.executeAction
 *                  │         ├─> InlineJsEngine (JS engine)
 *                  │         └─> IframeSandbox (JS engine)
 *                  └─> evaluateExpressions callback
 *                       ├─> extractExpressions (helper)
 *                       └─> evaluateExpressionAsync (helper)
 *                            └─> getJSEngine -> engine.evaluateExpression
 *                                 ├─> InlineJsEngine (JS engine)
 *                                 └─> IframeSandbox (JS engine)
 * 
 * @module compiler
 */

import React, { type ReactNode, type ComponentType } from 'react'
import { loadComponent, hasComponent } from '../components/react'
import { loadComponentFromBlob } from './blobJsLoader'

// ============================================================================
// Types and Constants
// ============================================================================

export const COMPILATION_STRATEGIES = {
  INLINE: 'inline',
  SANDBOX: 'sandbox',
  BLOB: 'blob'
} as const

export type CompilationStrategy = typeof COMPILATION_STRATEGIES[keyof typeof COMPILATION_STRATEGIES]

export interface ComponentDefinition {
  view: string
  data: Record<string, { type: string; initial: any }>
  actions?: Record<string, string>
  imports?: Array<Record<string, string>>
  compilationStrategy?: CompilationStrategy
}

interface JSEngine {
  evaluateExpression(expr: string, context: Record<string, any>): Promise<any>
  executeAction(
    code: string,
    data: Record<string, any>,
    setData: (update: any) => void
  ): Promise<void>
}

// ============================================================================
// Helpers
// ============================================================================

function serializeForPostMessage(obj: Record<string, any>): Record<string, any> {
  const serializable: Record<string, any> = {}
  Object.keys(obj).forEach(key => {
    const value = obj[key]
    if (typeof value !== 'function' && typeof value !== 'symbol') {
      serializable[key] = value
    }
  })
  return serializable
}

function waitForSandboxReady(
  getReady: () => boolean,
  onReady: () => void,
  onTimeout: () => void,
  timeoutMs: number = 5000
): void {
  if (getReady()) {
    onReady()
    return
  }

  const checkReady = setInterval(() => {
    if (getReady()) {
      clearInterval(checkReady)
      onReady()
    }
  }, 10)

  setTimeout(() => {
    clearInterval(checkReady)
    if (!getReady()) {
      onTimeout()
    }
  }, timeoutMs)
}


/**
 * Extract all element tag names from view HTML
 */
function extractElementNames(view: string): Set<string> {
  const elementNames = new Set<string>()
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(view.trim(), 'text/html')
    
    function traverse(node: Node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        const tagName = element.tagName.toLowerCase()
        elementNames.add(tagName)
        
        // Traverse children
        Array.from(element.childNodes).forEach(traverse)
      }
    }
    
    if (doc.body) {
      Array.from(doc.body.childNodes).forEach(traverse)
    }
  } catch (error) {
    console.error('Error extracting element names from view:', error)
  }
  
  return elementNames
}

/**
 * Convert element name to PascalCase (handles both kebab-case and single word)
 * This matches the registry format where components are registered in PascalCase
 */
function toPascalCaseFromTag(str: string): string {
  if (!str.includes('-')) {
    // Single word: capitalize first letter
    return str.charAt(0).toUpperCase() + str.slice(1)
  }
  // Kebab-case: convert to PascalCase
  return toPascalCase(str)
}

function resolveComponent(tagName: string, imports: Record<string, any>): any {
  // Convert tagName to PascalCase to match importMap keys (matching registry format)
  const pascalName = toPascalCaseFromTag(tagName)
  const component = imports[pascalName]
  if (component && (typeof component === 'function' || (typeof component === 'object' && component !== null))) {
    return component
  }
  
  // If not found in imports, return original tagName (for OOTB elements or web components)
  return tagName
}

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

function toReactPropName(attrName: string): string {
  if (attrName === 'class') return 'className'
  if (attrName === 'for') return 'htmlFor'

  if (attrName.startsWith('on') && attrName.length > 2) {
    return 'on' + attrName.charAt(2).toUpperCase() + attrName.slice(3)
  }

  if (attrName.startsWith('data-') || attrName.startsWith('aria-')) {
    return attrName
  }

  if (attrName.includes('-')) {
    return attrName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
  }

  return attrName
}

/**
 * Resolve absolute paths (starting with /) to include the Vite base URL
 * This ensures assets in public/ directory load correctly
 */
function resolvePath(path: string): string {
  if (path.startsWith('/') && !path.startsWith('//')) {
    const base = import.meta.env.BASE_URL
    // Remove trailing slash from base if present, then add path
    const basePath = base.endsWith('/') ? base.slice(0, -1) : base
    return `${basePath}${path}`
  }
  return path
}

function extractExpressions(template: string): string[] {
  const expressions: Set<string> = new Set()

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

async function evaluateExpressionAsync(
  expr: string,
  context: Record<string, any>,
  strategy: CompilationStrategy,
  actions?: Record<string, Function>
): Promise<any> {
  try {
    expr = expr.trim()

    if (actions && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr) && actions[expr]) {
      return actions[expr]
    }

    const engine = getJSEngine(strategy)
    return await engine.evaluateExpression(expr, context)
  } catch (error) {
    console.error(`Error evaluating expression "${expr}":`, error)
    return undefined
  }
}

function parseTextWithExpressions(
  text: string,
  evaluateExpression: (expr: string) => any,
  key: number = 0
): ReactNode {
  if (!text.includes('{')) {
    return text || null
  }

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

function parseAttributes(
  element: Element,
  evaluateExpression: (expr: string) => any
): Record<string, any> {
  const attrs: Record<string, any> = {}
  Array.from(element.attributes).forEach((attr) => {
    const reactName = toReactPropName(attr.name)
    let value: any = attr.value
    if (value.startsWith('{') && value.endsWith('}')) {
      value = evaluateExpression(value.slice(1, -1))
    } else if (typeof value === 'string' && (attr.name === 'src' || attr.name === 'href')) {
      // Resolve absolute paths for src and href attributes
      value = resolvePath(value)
    }
    attrs[reactName] = value
  })
  return attrs
}

// ============================================================================
// JS Engine
// ============================================================================

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
    this.iframe = document.createElement('iframe')
    this.iframe.setAttribute('sandbox', 'allow-scripts')
    this.iframe.style.display = 'none'
    this.iframe.src = '/sandbox.html'
    document.body.appendChild(this.iframe)
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
      const { id, callbackName, args } = event.data
      const callbacks = this.methodCallbacks.get(id)
      if (callbacks && callbacks[callbackName]) {
        callbacks[callbackName](...args)
      }
    }

    if (event.data.type === 'SANDBOX_ACTION_RESULT') {
      const { id, error } = event.data
      const request = this.pendingRequests.get(id)
      if (request) {
        this.pendingRequests.delete(id)
        this.methodCallbacks.delete(id)
        if (error) {
          request.reject(new Error(error))
        } else {
          request.resolve(null)
        }
      }
    }
  }

  private async ensureReady<T>(callback: () => Promise<T>): Promise<T> {
    if (!this.iframe?.contentWindow) {
      throw new Error('Sandbox iframe not initialized')
    }

    return new Promise((resolve, reject) => {
      waitForSandboxReady(
        () => this.ready,
        async () => {
          try {
            resolve(await callback())
          } catch (error) {
            reject(error)
          }
        },
        () => reject(new Error('Sandbox initialization timeout'))
      )
    })
  }

  async evaluateExpression(expr: string, context: Record<string, any>): Promise<any> {
    return this.ensureReady(() => {
      return new Promise((resolve, reject) => {
        this.sendEvaluationRequest(expr, context, resolve, reject)
      })
    })
  }

  async executeAction(
    code: string,
    data: Record<string, any>,
    setData: (update: any) => void
  ): Promise<void> {
    return this.ensureReady(() => {
      return new Promise((resolve, reject) => {
        this.sendActionExecutionRequest(code, data, setData, resolve, reject)
      })
    })
  }

  private setupTimeout(id: number, timeoutMs: number, onTimeout: () => void): void {
    setTimeout(() => {
      if (this.pendingRequests.has(id)) {
        this.pendingRequests.delete(id)
        this.methodCallbacks.delete(id)
        onTimeout()
      }
    }, timeoutMs)
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
    this.methodCallbacks.set(id, { setData })

    this.iframe!.contentWindow!.postMessage(
      {
        type: 'SANDBOX_ACTION_EVAL',
        id,
        actionCode,
        data: serializeForPostMessage(data)
      },
      '*'
    )

    this.setupTimeout(id, 10000, () => reject(new Error('Action execution timeout')))
  }

  private sendEvaluationRequest(
    code: string,
    context: Record<string, any>,
    resolve: (value: any) => void,
    reject: (error: any) => void
  ) {
    const id = this.requestId++
    this.pendingRequests.set(id, { resolve, reject })

    this.iframe!.contentWindow!.postMessage(
      {
        type: 'SANDBOX_EVAL',
        id,
        code,
        context: serializeForPostMessage(context)
      },
      '*'
    )

    this.setupTimeout(id, 10000, () => reject(new Error('Evaluation timeout')))
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

const engineInstances: Map<CompilationStrategy, JSEngine> = new Map()
const engineMap: Record<Exclude<CompilationStrategy, 'blob'>, () => JSEngine> = {
  [COMPILATION_STRATEGIES.INLINE]: () => new InlineJsEngine(),
  [COMPILATION_STRATEGIES.SANDBOX]: () => new IframeSandbox()
}

function getJSEngine(strategy: CompilationStrategy = COMPILATION_STRATEGIES.INLINE): JSEngine {
  if (strategy === COMPILATION_STRATEGIES.BLOB) {
    throw new Error('BLOB compilation strategy does not use JSEngine - it uses static compilation instead')
  }
  if (!engineInstances.has(strategy)) {
    const engine = engineMap[strategy as Exclude<CompilationStrategy, 'blob'>]()
    engineInstances.set(strategy, engine)
  }
  return engineInstances.get(strategy)!
}

// ============================================================================
// Component Helper
// ============================================================================

function initializeDataFromConfig(dataConfig: Record<string, { type: string; initial: any }> | undefined): Record<string, any> {
  const initialData: Record<string, any> = {}
  if (dataConfig) {
    Object.keys(dataConfig).forEach((key) => {
      initialData[key] = dataConfig[key].initial
    })
  }
  return initialData
}

/**
 * Load components based on elements found in view HTML
 * Ignores YAML imports config
 */
async function loadImportsFromView(view: string): Promise<Record<string, any>> {
  const importMap: Record<string, any> = {}
  const elementNames = extractElementNames(view)
  
  const importPromises: Promise<void>[] = []

  elementNames.forEach((tagName) => {
    // Convert to PascalCase to check registry
    const pascalName = toPascalCaseFromTag(tagName)
    
    // Check if component exists in registry
    if (hasComponent(pascalName)) {
      const loadPromise = (async () => {
        try {
          const component = await loadComponent(pascalName)
          if (component) {
            // Store under PascalCase (matching registry format)
            importMap[pascalName] = component
          }
        } catch (error) {
          console.error(`Failed to load component "${pascalName}" for tag "${tagName}":`, error)
        }
      })()
      
      importPromises.push(loadPromise)
    }
    // If not found in registry, we'll use the original tagName as-is (OOTB element or web component)
  })

  // Wait for all imports to complete
  if (importPromises.length > 0) {
    console.log(`Loading ${importPromises.length} components from view...`)
    try {
      await Promise.all(importPromises)
      console.log('All components loaded successfully')
    } catch (error) {
      console.error('Error loading components:', error)
    }
  }
  
  console.log('Final importMap:', Object.keys(importMap))
  return importMap
}

/**
 * Check if all components found in view are loaded
 * Components that exist in registry must be loaded, others (OOTB/web components) are always considered ready
 */
function checkImportsLoaded(
  view: string,
  imports: Record<string, any>
): boolean {
  const elementNames = extractElementNames(view)
  const componentsToCheck: string[] = []

  elementNames.forEach((tagName) => {
    const pascalName = toPascalCaseFromTag(tagName)
    // Only check components that exist in registry
    if (hasComponent(pascalName)) {
      // Check pascalName since that's what we store in importMap
      componentsToCheck.push(pascalName)
    }
    // OOTB elements and web components not in registry are always ready (no loading needed)
  })

  if (componentsToCheck.length === 0) {
    return true
  }

  // Check that all expected components are loaded and are valid React components
  // React components can be functions or objects (like forwardRef components)
  const allLoaded = componentsToCheck.every(key => {
    const importValue = imports[key]
    // A valid component can be:
    // 1. A function (function components)
    // 2. An object (forwardRef, memo, etc. - React components are objects)
    // Strings are paths (like '/vite.svg'), not components, so exclude them
    const hasImport = importValue && 
      (typeof importValue === 'function' || 
       (typeof importValue === 'object' && importValue !== null))
    
    if (!hasImport) {
      console.log(`Missing or invalid import for key "${key}":`, {
        exists: key in imports,
        type: typeof importValue,
        value: importValue
      })
    }
    return hasImport
  })
  
  if (!allLoaded) {
    const missing = componentsToCheck.filter(key => !imports[key] || (typeof imports[key] !== 'function' && (typeof imports[key] !== 'object' || imports[key] === null)))
    console.log('Missing imports:', missing)
    console.log('Expected component keys:', componentsToCheck)
    console.log('Available imports:', Object.keys(imports).map(k => ({ key: k, type: typeof imports[k], isFunction: typeof imports[k] === 'function' })))
  }
  
  return allLoaded
}

type CreateComponentDeps = {
  React: typeof React
  initializeDataFromConfig: typeof initializeDataFromConfig
  checkImportsLoaded: typeof checkImportsLoaded
  renderTemplate: (data: Record<string, any>, actions: Record<string, Function>, imports: Record<string, any>, expressionResults: Map<string, any>) => ReactNode
  parseActions: (actions: Record<string, string> | undefined, getData: () => Record<string, any>, setData: (data: Record<string, any>) => void) => Record<string, Function>
  evaluateExpressions?: (view: string, data: Record<string, any>, actions: Record<string, Function>) => Promise<Map<string, any>>
}

function createComponent(
  config: ComponentDefinition,
  deps: CreateComponentDeps
): ComponentType {
  const { React, initializeDataFromConfig, checkImportsLoaded, renderTemplate, parseActions, evaluateExpressions } = deps

  return function CompiledTemplate() {
    const [data, setData] = React.useState<Record<string, any>>({})
    const [actions, setActions] = React.useState<Record<string, Function>>({})
    const [imports, setImports] = React.useState<Record<string, any>>({})
    const [expressionResults, setExpressionResults] = React.useState<Map<string, any>>(new Map())
    const dataRef = React.useRef(data)

    React.useEffect(() => {
      dataRef.current = data
    }, [data])

    React.useEffect(() => {
      const initialData = initializeDataFromConfig(config.data)
      setData(initialData)
    }, [config.data])

    React.useEffect(() => {
      if (Object.keys(data).length > 0) {
        const parsedActions = parseActions(config.actions, () => dataRef.current, setData)
        setActions(parsedActions)
      }
    }, [data, config.actions])

    React.useEffect(() => {
      // Load components based on view elements
      const timeoutId = setTimeout(() => {
        console.error('Component loading timeout - components may have failed to load')
      }, 10000) // 10 second timeout
      
      loadImportsFromView(config.view)
        .then((imports) => {
          clearTimeout(timeoutId)
          setImports(imports)
        })
        .catch((error) => {
          clearTimeout(timeoutId)
          console.error('Failed to load components:', error)
          setImports({}) // Set empty imports to prevent infinite loading
        })
    }, [config.view])

    React.useEffect(() => {
      if (evaluateExpressions) {
        const hasData = Object.keys(data).length > 0
        // Components are always considered ready (OOTB elements don't need loading)
        if (hasData) {
          evaluateExpressions(config.view, data, actions).then(setExpressionResults)
        }
      }
    }, [config.view, data, actions, imports])

    if (config.actions && Object.keys(actions).length === 0 && Object.keys(data).length > 0) {
      return React.createElement('div', null, 'Loading actions...')
    }

    const importsLoaded = checkImportsLoaded(config.view, imports)
    if (!importsLoaded) {
      console.log('Components not loaded yet, waiting...', {
        loaded: Object.keys(imports),
        imports
      })
      return React.createElement('div', null, 'Loading components...')
    }

    const rendered = renderTemplate(data, actions, imports, expressionResults)
    return React.createElement(React.Fragment, null, rendered)
  }
}


// ============================================================================
// Template Compiler
// ============================================================================

function compileTemplateToJS(config: ComponentDefinition): string {
  const dataKeys = config.data ? Object.keys(config.data) : []
  const actionKeys = config.actions ? Object.keys(config.actions) : []
  
  // Prebuild component map: extract elements, convert to PascalCase, check registry
  const elementNames = extractElementNames(config.view)
  const componentMap = new Map<string, { isRegistered: boolean; pascalName: string }>() // tagName -> { isRegistered, pascalName }
  elementNames.forEach(tagName => {
    const pascalName = toPascalCaseFromTag(tagName)
    componentMap.set(tagName, { isRegistered: hasComponent(pascalName), pascalName })
  })

  // Compile template to JavaScript code
  function exprToJS(expr: string): string {
    expr = expr.trim()

    if (dataKeys.includes(expr)) {
      return `data.${expr}`
    }
    if (actionKeys.includes(expr)) {
      return `actions.${expr}`
    }

    // Components are HTML elements, not expressions - no need to handle them here
    let jsExpr = expr
    dataKeys.forEach(key => {
      jsExpr = jsExpr.replace(new RegExp(`\\b${key}\\b`, 'g'), `data.${key}`)
    })
    actionKeys.forEach(key => {
      jsExpr = jsExpr.replace(new RegExp(`\\b${key}\\b`, 'g'), `actions.${key}`)
    })

    return jsExpr
  }

  function textToJS(text: string): string {
    if (!text.includes('{')) {
      return text ? JSON.stringify(text) : 'null'
    }

    const parts: string[] = []
    let textIndex = 0
    while (textIndex < text.length) {
      const exprStart = text.indexOf('{', textIndex)
      if (exprStart === -1) {
        const remaining = text.substring(textIndex)
        if (remaining) parts.push(JSON.stringify(remaining))
        break
      }
      if (exprStart > textIndex) {
        parts.push(JSON.stringify(text.substring(textIndex, exprStart)))
      }
      const exprEnd = text.indexOf('}', exprStart)
      if (exprEnd === -1) break
      const expr = exprToJS(text.substring(exprStart + 1, exprEnd))
      parts.push(`String(${expr} ?? '')`)
      textIndex = exprEnd + 1
    }

    if (parts.length === 0) return 'null'
    if (parts.length === 1) return parts[0]
    return `[${parts.join(', ')}].join('')`
  }

  function attributesToJS(element: Element): string[] {
    const props: string[] = []
    const base = import.meta.env.BASE_URL
    Array.from(element.attributes).forEach((attr) => {
      const reactName = toReactPropName(attr.name)
      let value = attr.value
      if (value.startsWith('{') && value.endsWith('}')) {
        props.push(`${reactName}: ${exprToJS(value.slice(1, -1))}`)
      } else {
        // Resolve absolute paths for src and href attributes
        if ((attr.name === 'src' || attr.name === 'href') && value.startsWith('/') && !value.startsWith('//')) {
          const basePath = base.endsWith('/') ? base.slice(0, -1) : base
          value = `${basePath}${value}`
        }
        props.push(`${reactName}: ${JSON.stringify(value)}`)
      }
    })
    return props
  }

  function nodeToJS(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return textToJS(node.textContent || '')
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      const tagName = element.tagName.toLowerCase()
      const props = attributesToJS(element)
      const children: string[] = []

      Array.from(element.childNodes).forEach((child) => {
        const childJS = nodeToJS(child)
        if (childJS !== 'null') {
          children.push(childJS)
        }
      })

      // Use prebuilt component map: if registered, use imports[pascalName], otherwise use tagName
      const componentInfo = componentMap.get(tagName)
      const component = componentInfo?.isRegistered
        ? `(imports[${JSON.stringify(componentInfo.pascalName)}] || ${JSON.stringify(tagName)})`
        : JSON.stringify(tagName)

      const propsStr = props.length > 0 ? `{ ${props.join(', ')} }` : '{}'
      const childrenStr = children.length > 0 ? `, ${children.join(', ')}` : ''
      return `React.createElement(${component}, ${propsStr}${childrenStr})`
    }

    return 'null'
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(config.view.trim(), 'text/html')
  const body = doc.body

  let compiledView: string
  if (!body || body.children.length === 0) {
    compiledView = 'null'
  } else {
    const rootNodes: string[] = []
    Array.from(body.children).forEach((node) => {
      const js = nodeToJS(node)
      if (js !== 'null') {
        rootNodes.push(js)
      }
    })

    if (rootNodes.length === 0) {
      compiledView = 'null'
    } else if (rootNodes.length === 1) {
      compiledView = rootNodes[0]
    } else {
      compiledView = `React.createElement(React.Fragment, null, ${rootNodes.join(', ')})`
    }
  }

  const actionParsingCode = actionKeys.length > 0 ? actionKeys.map(key => {
    const actionCode = config.actions![key]
    return `parsedActions[${JSON.stringify(key)}] = () => {
          const currentData = getData();
          try {
            const actionFunc = ${actionCode};
            actionFunc(currentData, setData);
          } catch (error) {
            console.error(\`Error executing action ${JSON.stringify(key)}:\`, error);
          }
        };`
  }).join('\n        ') : ''

  return `export default function createCompiledComponent(config, deps) {
  const { createComponent, React, ...baseDeps } = deps;
  return createComponent(
    config,
    {
      ...deps,
      renderTemplate: (data, actions, imports, expressionResults) => {
        return ${compiledView};
      },
      parseActions: (actions, getData, setData) => {
        const parsedActions = {};
        ${actionParsingCode}
        return parsedActions;
      }
    }
  );
}`
}

async function compileTemplateToJsBlobComponent(config: ComponentDefinition): Promise<ComponentType> {
  const componentCode = compileTemplateToJS(config)
  return loadComponentFromBlob(
    componentCode,
    { data: config.data, view: config.view },
    {
      React,
      createComponent,
      initializeDataFromConfig,
      checkImportsLoaded
    }
  )
}

function compileTemplateToInlineComponent(config: ComponentDefinition, effectiveStrategy: CompilationStrategy): ComponentType {
  return createComponent(config, {
    React,
    initializeDataFromConfig,
    checkImportsLoaded,
    renderTemplate: (_data, _actions, imports, expressionResults) => {
      function evaluateExpression(expr: string): any {
        return expressionResults?.get(expr) ?? undefined
      }

      function domToReact(node: Node, key: number = 0): ReactNode {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || ''
          return parseTextWithExpressions(text, evaluateExpression, key)
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element
          const tagName = element.tagName.toLowerCase()
          const attrs = parseAttributes(element, evaluateExpression)
          const Component = resolveComponent(tagName, imports)

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

      const trimmedTemplate = config.view.trim()
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(trimmedTemplate, 'text/html')
        const body = doc.body
        if (!body || body.children.length === 0) {
          return null
        }

        const children: ReactNode[] = []
        Array.from(body.children).forEach((node, idx) => {
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
    },
    parseActions: (actions, getData, setData) => {
      const parsedActions: Record<string, Function> = {}
      if (actions) {
        Object.keys(actions).forEach((actionName) => {
          const actionStr = actions[actionName]
          parsedActions[actionName] = async () => {
            const currentData = getData()
            try {
              const engine = getJSEngine(effectiveStrategy)
              await engine.executeAction(actionStr, currentData, setData)
            } catch (error) {
              console.error(`Error executing action ${actionName}:`, error)
            }
          }
        })
      }
      return parsedActions
    },
    evaluateExpressions: async (view, data, actions) => {
      const expressions = extractExpressions(view)
      if (expressions.length === 0) {
        return new Map()
      }

      // Components are HTML elements, not part of expression context
      const context: Record<string, any> = { ...data }

      const results = new Map<string, any>()
      await Promise.all(
        expressions.map(async (expr) => {
          try {
            const result = await evaluateExpressionAsync(expr, context, effectiveStrategy, actions)
            results.set(expr, result)
          } catch (error) {
            console.error(`Error evaluating expression "${expr}":`, error)
            results.set(expr, undefined)
          }
        })
      )

      return results
    }
  })
}

export async function compileTemplate(config: ComponentDefinition, compilationStrategy?: CompilationStrategy): Promise<ComponentType> {
  const effectiveStrategy = compilationStrategy || config.compilationStrategy || COMPILATION_STRATEGIES.BLOB

  if (effectiveStrategy === COMPILATION_STRATEGIES.BLOB) {
    return await compileTemplateToJsBlobComponent(config)
  }

  return compileTemplateToInlineComponent(config, effectiveStrategy)
}
