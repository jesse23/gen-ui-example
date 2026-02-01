import React, { useState, useEffect, type ReactNode } from 'react'
import { loadAllComponents } from '../../components/decl'
import { loadAllActions } from '../../services/actions'
import {
  type DeclNode,
  type DeclSpec,
  type DeclData,
  renderDeclNode,
  type RenderContext
} from '../../services/decl'
import Spinner from './Spinner'

interface DeclGenRendererProps {
  /** The DECL spec to render (view + data). undefined = loading, null = error/empty */
  declSpec: DeclSpec | null | undefined
}

function DeclGenRenderer({ declSpec }: DeclGenRendererProps) {
  const [loadedComponents, setLoadedComponents] = useState<Map<string, any>>(new Map())
  const [actionHandlers, setActionHandlers] = useState<Map<string, (...args: any[]) => any>>(new Map())
  const [dataStore, setDataStore] = useState<DeclData>({})

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

  // Sync dataStore with declSpec.data when it changes
  useEffect(() => {
    if (declSpec?.data) {
      setDataStore(declSpec.data)
    } else {
      setDataStore({})
    }
  }, [declSpec?.data])

  // Show loader when declSpec is undefined (loading state)
  if (declSpec === undefined) {
    return React.createElement('div', { className: 'flex-1 overflow-auto p-8 bg-white flex items-center justify-center' },
      React.createElement('div', { className: 'flex flex-col items-center justify-center' },
        React.createElement(Spinner, { size: 'lg', className: 'text-blue-500 mb-4' }),
        React.createElement('div', { className: 'text-gray-600 text-sm font-medium' }, 'Generating UI component...'),
        React.createElement('div', { className: 'text-gray-400 text-xs mt-2' }, 'This may take a few moments')
      )
    )
  }

  // Get view from declSpec
  const view = declSpec?.view

  // Render directly - React will re-render when declSpec changes
  let renderedComponent: ReactNode = null

  if (view && Array.isArray(view) && view.length > 0) {
    try {
      // Convert view nodes to Map for faster lookups
      const nodesMap = new Map<string, DeclNode>()
      const childKeys = new Set<string>()
      view.forEach((node) => {
        const key = typeof node.key === 'string' ? node.key : String(node.key || `node-${node.type}`)
        nodesMap.set(key, node)
        // Collect keys that appear as children of any node
        const children = node.children ?? (node.props?.children && Array.isArray(node.props.children) ? node.props.children : [])
        const content = node.props?.content && Array.isArray(node.props.content) ? node.props.content : []
        ;[...children, ...content].forEach((c) => {
          if (typeof c === 'string') childKeys.add(c)
        })
      })
      // Root nodes are those not referenced as children by any other node
      const rootKeys = view
        .map((node) => (typeof node.key === 'string' ? node.key : String(node.key || `node-${node.type}`)))
        .filter((key) => !childKeys.has(key))
      // If no clear root (no parent-child refs), treat all as roots
      const keysToRender = rootKeys.length > 0 ? rootKeys : view.map((node) => (typeof node.key === 'string' ? node.key : String(node.key || `node-${node.type}`)))

      const renderContext: RenderContext = {
        declNodes: nodesMap,
        loadedComponents,
        loadedActions: actionHandlers,
        dataStore,
        setDataStore: (updater) => {
          setDataStore(updater)
        }
      }
      if (keysToRender.length === 1) {
        renderedComponent = renderDeclNode(keysToRender[0], renderContext)
      } else {
        renderedComponent = React.createElement(
          React.Fragment,
          {},
          ...keysToRender.map((key) => renderDeclNode(key, renderContext))
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

export default DeclGenRenderer
