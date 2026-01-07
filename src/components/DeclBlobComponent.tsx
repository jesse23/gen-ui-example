import React, { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import { type TemplateConfig, type EngineType } from '../services/compiler'

interface DeclBlobComponentProps {
  src: string
  engineType?: EngineType
}

/**
 * Convert template with {expressions} to React.createElement calls with inlined expressions.
 * Replaces {expression} with direct JavaScript references (e.g., {count} -> data.count)
 */
function compileTemplateToJS(template: string, dataKeys: string[], actionKeys: string[], importKeys: string[]): string {
  // Helper to convert expression to JavaScript reference
  function exprToJS(expr: string): string {
    expr = expr.trim()
    
    // Check if it's a data reference
    if (dataKeys.includes(expr)) {
      return `data.${expr}`
    }
    
    // Check if it's an action reference
    if (actionKeys.includes(expr)) {
      return `actions.${expr}`
    }
    
    // Check if it's an import reference
    if (importKeys.includes(expr)) {
      return `imports.${expr}`
    }
    
    // For complex expressions, try to replace known identifiers
    let jsExpr = expr
    dataKeys.forEach(key => {
      const regex = new RegExp(`\\b${key}\\b`, 'g')
      jsExpr = jsExpr.replace(regex, `data.${key}`)
    })
    actionKeys.forEach(key => {
      const regex = new RegExp(`\\b${key}\\b`, 'g')
      jsExpr = jsExpr.replace(regex, `actions.${key}`)
    })
    importKeys.forEach(key => {
      const regex = new RegExp(`\\b${key}\\b`, 'g')
      jsExpr = jsExpr.replace(regex, `imports.${key}`)
    })
    
    return jsExpr
  }

  // Parse HTML and convert to React.createElement calls
  const parser = new DOMParser()
  const doc = parser.parseFromString(template.trim(), 'text/html')
  const body = doc.body
  
  if (!body || body.children.length === 0) {
    return 'null'
  }

  function toPascalCase(str: string): string {
    return str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
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

  function nodeToJS(node: Node, indent: number = 0): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      const trimmed = text.trim()
      if (trimmed === '<' || trimmed === '>' || trimmed === '</' || trimmed === '/>') {
        return 'null'
      }
      
      // Handle expressions in text
      if (text.includes('{')) {
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
          const expr = text.substring(exprStart + 1, exprEnd)
          const jsExpr = exprToJS(expr)
          parts.push(`String(${jsExpr} ?? '')`)
          textIndex = exprEnd + 1
        }
        if (parts.length === 0) return 'null'
        if (parts.length === 1) return parts[0]
        return `[${parts.join(', ')}].join('')`
      }
      
      return text ? JSON.stringify(text) : 'null'
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      const tagName = element.tagName.toLowerCase()
      
      // Build props object
      const props: string[] = []
      Array.from(element.attributes).forEach((attr) => {
        const reactName = toReactPropName(attr.name)
        let value = attr.value
        
        // Check if value contains {expression}
        if (value.startsWith('{') && value.endsWith('}')) {
          const expr = value.slice(1, -1)
          const jsExpr = exprToJS(expr)
          props.push(`${reactName}: ${jsExpr}`)
        } else {
          props.push(`${reactName}: ${JSON.stringify(value)}`)
        }
      })
      
      // Build children
      const children: string[] = []
      Array.from(element.childNodes).forEach((child) => {
        const childJS = nodeToJS(child, indent + 1)
        if (childJS !== 'null') {
          children.push(childJS)
        }
      })
      
      // Determine component
      const isComponent = tagName.includes('-') || importKeys.includes(tagName)
      let component: string
      if (isComponent) {
        const pascalName = toPascalCase(tagName)
        component = `imports.${tagName} || imports.${pascalName} || ${JSON.stringify(tagName)}`
      } else {
        component = JSON.stringify(tagName)
      }
      
      const propsStr = props.length > 0 ? `{ ${props.join(', ')} }` : '{}'
      const childrenStr = children.length > 0 ? `, ${children.join(', ')}` : ''
      
      return `React.createElement(${component}, ${propsStr}${childrenStr})`
    }

    return 'null'
  }

  // Convert all root nodes
  const rootNodes: string[] = []
  Array.from(body.children).forEach((node) => {
    const js = nodeToJS(node)
    if (js !== 'null') {
      rootNodes.push(js)
    }
  })

  if (rootNodes.length === 0) {
    return 'null'
  }
  
  if (rootNodes.length === 1) {
    return rootNodes[0]
  }
  
  return `React.createElement(React.Fragment, null, ${rootNodes.join(', ')})`
}

/**
 * Generate JavaScript source code for a React component from a template config.
 * All expressions are inlined directly into the JavaScript code - no runtime evaluation.
 */
function generateComponentCode(config: TemplateConfig): string {
  const dataKeys = config.data ? Object.keys(config.data) : []
  const actionKeys = config.actions ? Object.keys(config.actions) : []
  const importKeys: string[] = []
  if (config.imports) {
    config.imports.forEach(imp => {
      Object.keys(imp).forEach(key => {
        importKeys.push(key)
        // Also add kebab-case version
        const kebab = key.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
        if (kebab !== key) {
          importKeys.push(kebab)
        }
      })
    })
  }

  // Compile template to JS
  const compiledView = compileTemplateToJS(config.view, dataKeys, actionKeys, importKeys)
  
  const dataConfig = config.data ? JSON.stringify(config.data) : '{}'
  const actionsConfig = config.actions ? JSON.stringify(config.actions) : '{}'
  const importsConfig = config.imports ? JSON.stringify(config.imports) : '[]'
  
  return `const React = window.React;
const { useState, useEffect, useRef } = window;
const { loadComponent } = window;

function toPascalCase(str) {
  return str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

function toKebabCase(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

function CompiledTemplate() {
  const [data, setData] = useState({});
  const [actions, setActions] = useState({});
  const [imports, setImports] = useState({});
  const dataRef = useRef(data);
  
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const initialData = {};
    const dataConfig = ${dataConfig};
    if (dataConfig) {
      Object.keys(dataConfig).forEach((key) => {
        initialData[key] = dataConfig[key].initial;
      });
    }
    setData(initialData);
  }, []);

  useEffect(() => {
    const actionsConfig = ${actionsConfig};
    if (actionsConfig && Object.keys(data).length > 0) {
      const parsedActions = {};
      ${actionKeys.map(key => {
        const actionCode = config.actions![key]
        // Inline the action code directly - it's already a function string
        return `parsedActions[${JSON.stringify(key)}] = () => {
        const currentData = dataRef.current;
        try {
          const actionFunc = ${actionCode};
          actionFunc(currentData, setData);
        } catch (error) {
          console.error(\`Error executing action ${JSON.stringify(key)}:\`, error);
        }
      };`
      }).join('\n      ')}
      setActions(parsedActions);
    }
  }, [data]);

  useEffect(() => {
    const importsConfig = ${importsConfig};
    if (importsConfig) {
      const importMap = {};
      const importPromises = [];
      
      importsConfig.forEach((imp) => {
        Object.keys(imp).forEach((key) => {
          const path = imp[key];
          if (path.startsWith('/')) {
            importMap[key] = path;
          } else {
            const componentName = path.replace(/\\.tsx$/, '');
            const pascalComponentName = toPascalCase(componentName);
            const pascalKey = toPascalCase(key);
            
            importPromises.push(
              loadComponent(pascalComponentName)
                .then((component) => {
                  if (component) {
                    importMap[key] = component;
                    importMap[toKebabCase(key)] = component;
                  } else {
                    return loadComponent(pascalKey).then((fallbackComponent) => {
                      if (fallbackComponent) {
                        importMap[key] = fallbackComponent;
                        importMap[toKebabCase(key)] = fallbackComponent;
                      }
                    });
                  }
                })
                .catch((error) => {
                  console.error(\`Failed to load component "\${pascalComponentName}" for key "\${key}":\`, error);
                })
            );
          }
        });
      });
      
      Promise.all(importPromises).then(() => {
        setImports(importMap);
      });
    }
  }, []);

  const actionsConfig = ${actionsConfig};
  if (actionsConfig && Object.keys(actions).length === 0 && Object.keys(data).length > 0) {
    return React.createElement('div', null, 'Loading actions...');
  }

  const importsConfig = ${importsConfig};
  if (importsConfig) {
    const expectedComponentKeys = [];
    importsConfig.forEach(imp => {
      Object.keys(imp).forEach(key => {
        const path = imp[key];
        if (!path.startsWith('/')) {
          expectedComponentKeys.push(key);
          expectedComponentKeys.push(toKebabCase(key));
        }
      });
    });
    if (expectedComponentKeys.length > 0) {
      const hasAllImports = expectedComponentKeys.every(key => 
        imports[key] && typeof imports[key] === 'function'
      );
      if (!hasAllImports) {
        return React.createElement('div', null, 'Loading components...');
      }
    }
  }

  return ${compiledView};
}

export default CompiledTemplate;`
}

function DeclBlobComponent({ src, engineType }: DeclBlobComponentProps) {
  const [Component, setComponent] = useState<React.ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Construct path to template: /templates/{src}.yml
    const templatePath = `/templates/${src}.yml`
    
    // Load and parse YAML
    fetch(templatePath)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load template: ${res.statusText}`)
        }
        return res.text()
      })
      .then((text) => {
        const parsed = yaml.load(text) as TemplateConfig
        // Override engineType from props if provided
        if (engineType !== undefined) {
          parsed.engineType = engineType
        }
        
        // Generate JavaScript code from the template
        const componentCode = generateComponentCode(parsed)
        
        // Create a blob from the code
        const blob = new Blob([componentCode], { type: 'application/javascript' })
        const blobUrl = URL.createObjectURL(blob)
        
        // Dynamically import the blob
        return import(/* @vite-ignore */ blobUrl)
          .then((module) => {
            const CompiledComponent = module.default
            if (CompiledComponent) {
              setComponent(() => CompiledComponent)
            } else {
              throw new Error('Component export not found in blob')
            }
          })
          .finally(() => {
            // Clean up blob URL
            URL.revokeObjectURL(blobUrl)
          })
      })
      .catch((err) => {
        console.error('Error loading template:', err)
        setError(err.message)
      })
  }, [src, engineType])

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>
  }

  if (!Component) {
    return <div>Loading...</div>
  }

  return <Component />
}

export default DeclBlobComponent
