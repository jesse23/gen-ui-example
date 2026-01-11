import React, { useState, useEffect, type ReactNode } from 'react'
import { type DeclStructure, type DeclElement } from '../services/declCodeGenerator'
import { 
  loadAllComponents, 
  loadAllActions, 
  renderDeclElement, 
  type RenderContext 
} from '../services/declComponentUtils'
import Spinner from './Spinner'

interface DeclGenComponentProps {
  declStructure: DeclStructure | null | undefined
}

function DeclGenComponent({ declStructure }: DeclGenComponentProps) {
  const [loadedComponents, setLoadedComponents] = useState<Map<string, any>>(new Map())
  const [actionHandlers, setActionHandlers] = useState<Map<string, (...args: any[]) => any>>(new Map())

  // Load all components when component mounts first time
  useEffect(() => {
    loadAllComponents().then((components) => {
      setLoadedComponents(components)
    })
  }, []) // Only run on mount

  // Load all actions when component mounts first time
  useEffect(() => {
    const actions = loadAllActions()
    setActionHandlers(actions)
  }, []) // Only run on mount

  // Show loader when declStructure is undefined (loading state)
  if (declStructure === undefined) {
    return React.createElement('div', { className: 'flex-1 overflow-auto p-8 bg-white flex items-center justify-center' },
      React.createElement('div', { className: 'flex flex-col items-center justify-center' },
        React.createElement(Spinner, { size: 'lg', className: 'text-blue-500 mb-4' }),
        React.createElement('div', { className: 'text-gray-600 text-sm font-medium' }, 'Generating UI component...'),
        React.createElement('div', { className: 'text-gray-400 text-xs mt-2' }, 'This may take a few moments')
      )
    )
  }

  // Render directly - React will re-render when declStructure changes
  let renderedComponent: ReactNode = null

  if (declStructure && Array.isArray(declStructure) && declStructure.length > 0) {
    try {
      const rootElement = declStructure[0]
      // Convert elements array to Map for faster lookups
      const elementsMap = new Map<string, DeclElement>()
      declStructure.forEach((el) => {
        const key = typeof el.key === 'string' ? el.key : String(el.key || `element-${el.type}`)
        elementsMap.set(key, el)
      })
      // Create render context
      const renderContext: RenderContext = {
        declElements: elementsMap,
        loadedComponents,
        loadedActions: actionHandlers
      }
      // Get root element key
      const rootElementKey = typeof rootElement.key === 'string' ? rootElement.key : String(rootElement.key || `element-${rootElement.type}`)
      // Root element will have its key set by renderDeclElement
      // This ensures React can efficiently update the VDOM during incremental rendering
      renderedComponent = renderDeclElement(rootElementKey, renderContext)
    } catch (err: any) {
      console.error('Error rendering component:', err)
      renderedComponent = React.createElement('div', {
        key: 'error',
        className: 'p-4 bg-red-50 border border-red-200 rounded text-red-600'
      },
        React.createElement('div', { key: 'error-title', className: 'font-semibold mb-2' }, 'Rendering Error'),
        React.createElement('div', { key: 'error-message', className: 'text-sm' }, err.message || 'Failed to render component')
      )
    }
  }

  return React.createElement('div', { className: 'flex-1 overflow-auto p-8 bg-white' },
    renderedComponent || React.createElement('div', { className: 'p-4 text-gray-600' }, 'No component to render. Enter a prompt and click Generate.')
  )
}

export default DeclGenComponent
