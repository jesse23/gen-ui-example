import React, { useState, useEffect, useRef, type ComponentType, type ReactNode } from 'react'
import Editor from '@monaco-editor/react'
import { generate } from '../services/reactCodeGenerator'
import { loadComponentFromBlob } from '../services/blobJsLoader'
import Spinner from './Spinner'

// Error Boundary component to catch rendering errors
class ErrorBoundary extends React.Component<
  { children: ReactNode; onError: (error: Error, errorInfo: React.ErrorInfo) => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onError: (error: Error, errorInfo: React.ErrorInfo) => void }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return null // Error is handled by parent via onError callback
    }
    return this.props.children
  }
}

// Wrapper component that validates the generated component's return value
// This catches cases where AI-generated code returns a function instead of a React element
function ValidatedComponent({ Component }: { Component: ComponentType }) {
  // Create a wrapper component that intercepts and validates the return value
  const WrappedComponent = React.useMemo(() => {
    return function ValidatedWrapper(props: any) {
      try {
        // Call the component to get its return value
        // GenUI always generates function components, so we can safely call it as a function
        let returnValue: any
        if (typeof Component === 'function') {
          // Check if it's a class component (has prototype.render) or function component
          if (Component.prototype && Component.prototype.isReactComponent) {
            // It's a class component, use createElement
            returnValue = React.createElement(Component, props || {})
          } else {
            // It's a function component, call it directly
            returnValue = (Component as React.FC<any>)(props || {})
          }
        } else {
          // Fallback (shouldn't happen with genui)
          returnValue = React.createElement(Component, props || {})
        }
        
        // Validate: check if it's a function (invalid - should be a React element)
        // In the genui pattern, components should return React elements directly, not functions
        if (typeof returnValue === 'function') {
          throw new Error(
            'Component returned a function instead of a React component.\n\n' +
            'React components must return React components (or null), not functions.\n' +
            'Common mistake: returning `() => component` instead of `component`.\n\n' +
            'Fix: Change `return () => component;` to `return component;`'
          )
        }
        
        // Return the validated value
        return returnValue
      } catch (error) {
        // Re-throw so error boundary catches it
        throw error
      }
    }
  }, [Component])
  
  return React.createElement(WrappedComponent)
}

interface ReactGenComponentProps {
  prompt: string | null
}

function ReactGenComponent({ prompt }: ReactGenComponentProps) {
  const [Component, setComponent] = useState<ComponentType | null | undefined>(null)
  const [code, setCode] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const effectRunRef = useRef<number>(0)
  const activeRunRef = useRef<number | null>(null)

  useEffect(() => {
    if (!prompt) return

    setError(null)
    setComponent(undefined) // undefined = loading state
    setCode('')
    
    // Track this effect run
    const currentRun = ++effectRunRef.current
    
    // Use a microtask to ensure only the last Strict Mode invocation proceeds
    // This prevents duplicate API calls
    Promise.resolve().then(() => {
      // Check if this is still the latest run after microtask
      // If Strict Mode ran twice, only the second one will have currentRun === effectRunRef.current
      if (currentRun !== effectRunRef.current) return
      
      // Mark this as the active run
      activeRunRef.current = currentRun
      
      // Generate code
      generate(prompt)
        .then(async (moduleCode) => {
          // Ignore if this is not the active run anymore
          if (activeRunRef.current !== currentRun) return
          
          setCode(moduleCode)
          
          // Check again after async operations
          if (activeRunRef.current !== currentRun) return
          
          // Load component from blob (component loading is handled inside blobJsLoader)
          try {
            const GeneratedComponent = await loadComponentFromBlob(moduleCode, React)
            setComponent(() => GeneratedComponent)
            setRenderError(null) // Clear any previous render errors
          } catch (err: any) {
            // Catch errors during component loading/compilation
            if (activeRunRef.current !== currentRun) return
            console.error('Error loading component from blob:', err)
            setError(err.message || 'Failed to load generated component')
            setComponent(null)
          }
        })
        .catch((err) => {
          // Ignore errors if this is not the active run anymore
          if (activeRunRef.current !== currentRun) return
          
          console.error('Error generating UI:', err)
          setError(err.message || 'Failed to generate UI')
          setComponent(null)
        })
    })
    
    // Cleanup: clear active run if this effect is cleaned up
    return () => {
      if (activeRunRef.current === currentRun) {
        activeRunRef.current = null
      }
    }
  }, [prompt])

  return (
    <div className="flex h-full">
      {/* Left Panel - Component Preview */}
      <div className="w-1/2 border-r border-gray-200 flex flex-col">
        <div className="py-2 px-4 border-b border-gray-200 bg-white flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">Component Preview</h2>
        </div>
        <div className="flex-1 overflow-auto p-8 bg-white">
          {Component === undefined ? (
            // Loading state - show spinner
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center justify-center">
                <Spinner size="lg" className="text-blue-500 mb-4" />
                <div className="text-gray-600 text-sm font-medium">Generating UI component...</div>
                <div className="text-gray-400 text-xs mt-2">This may take a few moments</div>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md mb-4">
              <div className="text-red-800 font-semibold mb-2">Error</div>
              <div className="text-red-600 text-sm">{error}</div>
            </div>
          ) : renderError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md mb-4">
              <div className="text-red-800 font-semibold mb-2">Rendering Error</div>
              <div className="text-red-600 text-sm whitespace-pre-wrap">{renderError}</div>
            </div>
          ) : !Component ? (
            <div className="p-4 text-gray-600">No component to render. Enter a prompt and click Generate.</div>
          ) : (
            <ErrorBoundary
              onError={(error, errorInfo) => {
                console.error('Component render error:', error, errorInfo)
                setRenderError(error.message || String(error))
              }}
            >
              <ValidatedComponent Component={Component} />
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* Right Panel - Generated Code */}
      <div className="w-1/2 flex flex-col">
        <div className="py-2 px-4 border-b border-gray-200 bg-white flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">Generated Code</h2>
        </div>
        <div className="flex-1">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            value={code || ''}
            theme="vs-light"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default ReactGenComponent
