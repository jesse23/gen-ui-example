import React, { useState, useEffect, type ReactNode } from 'react'
import { type DeclStructure, type DeclElement, type DeclAggregatedResponse, type DeclStreamResponse } from '../../services/declCodeGenerator'
import { 
  loadAllComponents, 
  loadAllActions, 
  renderDeclElement, 
  type RenderContext 
} from '../../services/declComponentUtils'
import Spinner from './Spinner'

interface DeclGenComponentProps {
  declStructure: DeclStreamResponse | DeclAggregatedResponse | null | undefined
}

function DeclGenComponent({ declStructure }: DeclGenComponentProps) {
  const [loadedComponents, setLoadedComponents] = useState<Map<string, any>>(new Map())
  const [actionHandlers, setActionHandlers] = useState<Map<string, (...args: any[]) => any>>(new Map())
  const [dataStore, setDataStore] = useState<Record<string, any>>({})
  const [view, setView] = useState<DeclStructure>([])
  const processedChunksRef = React.useRef<number>(0)

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

  // Incrementally aggregate streamed chunks into { view, data }
  useEffect(() => {
    // Reset on new generation/loading/error
    if (declStructure === undefined || declStructure === null) {
      processedChunksRef.current = 0
      setView([])
      setDataStore({})
      return
    }

    // Final aggregated result (non-stream)
    if (!Array.isArray(declStructure)) {
      processedChunksRef.current = 0
      setView(declStructure.view || [])
      setDataStore(declStructure.data || {})
      return
    }

    // Streamed chunks array
    const chunks = declStructure
    const start = processedChunksRef.current
    const end = chunks.length
    if (end <= start) return

    for (let i = start; i < end; i++) {
      const chunk: any = chunks[i]
      if (!chunk || typeof chunk !== 'object') continue

      if ('view' in chunk && Array.isArray(chunk.view)) {
        setView((prev) => [...prev, ...chunk.view])
        continue
      }

      if ('data' in chunk && chunk.data && typeof chunk.data === 'object' && !Array.isArray(chunk.data)) {
        setDataStore((prev) => ({ ...prev, ...chunk.data }))
      }
    }

    processedChunksRef.current = end
  }, [declStructure])

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

  if (view && Array.isArray(view) && view.length > 0) {
    try {
      // Convert elements array to Map for faster lookups
      const elementsMap = new Map<string, DeclElement>()
      const childKeys = new Set<string>()
      view.forEach((el) => {
        const key = typeof el.key === 'string' ? el.key : String(el.key || `element-${el.type}`)
        elementsMap.set(key, el)
        // Collect keys that appear as children of any element
        const children = el.children ?? (el.props?.children && Array.isArray(el.props.children) ? el.props.children : [])
        const content = el.props?.content && Array.isArray(el.props.content) ? el.props.content : []
        ;[...children, ...content].forEach((c) => {
          if (typeof c === 'string') childKeys.add(c)
        })
      })
      // Root elements are those not referenced as children by any other element
      const rootKeys = view
        .map((el) => (typeof el.key === 'string' ? el.key : String(el.key || `element-${el.type}`)))
        .filter((key) => !childKeys.has(key))
      // If no clear root (no parent-child refs), treat all as roots
      const keysToRender = rootKeys.length > 0 ? rootKeys : view.map((el) => (typeof el.key === 'string' ? el.key : String(el.key || `element-${el.type}`)))

      const renderContext: RenderContext = {
        declElements: elementsMap,
        loadedComponents,
        loadedActions: actionHandlers,
        dataStore,
        setDataStore: (updater) => {
          setDataStore(updater)
        }
      }
      if (keysToRender.length === 1) {
        renderedComponent = renderDeclElement(keysToRender[0], renderContext)
      } else {
        renderedComponent = React.createElement(
          React.Fragment,
          {},
          ...keysToRender.map((key) => renderDeclElement(key, renderContext))
        )
      }
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
