import { useState, useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import DeclGenRenderer from '../components/react/DeclGenRenderer'
import { Button } from '../components/ui/button'
import { generate, type DeclSpec } from '../services/declCodeGenerator'
import { tryParseJson } from '../services/declComponentUtils'
import { getPageMetadata } from './pages'

export const pageMetadata = getPageMetadata('/decl-gen')!

const DEFAULT_PROMPT = "A form to create a LinkdIn Profile, with all the required and optional fields"

export default function DeclGenExample() {
  const [prompt, setPrompt] = useState<string | null>(null)
  const [generationKey, setGenerationKey] = useState<number>(0)
  const [inputValue, setInputValue] = useState(DEFAULT_PROMPT)
  // Editor JSON text - updated from streaming and can be edited by user
  const [jsonText, setJsonText] = useState<string>('')
  // isGenerating: true while AI is streaming, false otherwise
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const effectRunRef = useRef<number>(0)
  const activeRunRef = useRef<number | null>(null)

  // Derive declSpec from jsonText for the renderer
  // undefined = loading (isGenerating && no valid JSON yet), null = error, DeclSpec = valid
  const declSpec: DeclSpec | null | undefined = (() => {
    if (isGenerating && !jsonText.trim()) {
      return undefined // loading state
    }
    if (error) {
      return null
    }
    const parsed = tryParseJson<{ view?: unknown; data?: unknown }>(jsonText)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const view = Array.isArray(parsed.view) ? parsed.view : []
      const data = (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) ? parsed.data : {}
      return { view, data } as DeclSpec
    }
    // Not valid JSON or wrong shape - empty spec if no input, else null
    return jsonText.trim() ? null : { view: [], data: {} }
  })()

  useEffect(() => {
    if (!prompt) return

    // Track this effect run
    const currentRun = ++effectRunRef.current

    // Reset state for this new generation immediately
    setError(null)
    setJsonText('')
    setIsGenerating(true)

    // Use a microtask to ensure only the last Strict Mode invocation proceeds
    Promise.resolve().then(() => {
      // Check if this is still the latest run after microtask
      if (currentRun !== effectRunRef.current) return

      // Mark this as the active run
      activeRunRef.current = currentRun

      // Generate DECL spec with streaming
      // The generate function sends parsed DeclSpec on each update
      generate(prompt, {
        onUpdate: (spec) => {
          if (activeRunRef.current !== currentRun) return
          // Update editor with formatted JSON
          setJsonText(JSON.stringify(spec, null, 2))
        }
      })
        .then((spec) => {
          if (activeRunRef.current !== currentRun) return
          // Final spec - update editor with formatted JSON
          setJsonText(JSON.stringify(spec, null, 2))
          setIsGenerating(false)
        })
        .catch((err) => {
          if (activeRunRef.current !== currentRun) return
          console.error('Error generating DECL spec:', err)
          setError(err.message || 'Failed to generate DECL spec')
          setIsGenerating(false)
        })
    })

    // Cleanup: clear active run if this effect is cleaned up
    return () => {
      if (activeRunRef.current === currentRun) {
        activeRunRef.current = null
      }
    }
  }, [prompt, generationKey])

  const handleGenerate = () => {
    // Reset all state immediately when generating
    setError(null)
    setJsonText('')
    setIsGenerating(true)
    // Cancel any previous runs by clearing the active run
    activeRunRef.current = null
    // Set prompt and increment generation key to force effect re-run
    setPrompt(inputValue)
    setGenerationKey(prev => prev + 1)
  }

  // Handle editor changes - allows manual editing when not generating
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!isGenerating && value !== undefined) {
      setJsonText(value)
      setError(null) // Clear error when user edits
    }
  }, [isGenerating])

  return (
    <div className="h-full bg-gray-50 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <label htmlFor="prompt-input" className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Prompt:
          </label>
          <input
            id="prompt-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleGenerate()
              }
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter your UI generation prompt..."
          />
          <Button variant="default" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden flex">
        {/* Left Panel - Component Preview */}
        <div className="w-1/2 border-r border-gray-200 flex flex-col">
          <div className="py-2 px-4 border-b border-gray-200 bg-white flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-800">DECL Preview</h2>
          </div>
          <div className="flex-1 overflow-auto">
            {error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md m-4">
                <div className="text-red-800 font-semibold mb-2">Error</div>
                <div className="text-red-600 text-sm">{error}</div>
              </div>
            ) : (
              <DeclGenRenderer declSpec={declSpec} />
            )}
          </div>
        </div>

        {/* Right Panel - Editable JSON */}
        <div className="w-1/2 flex flex-col">
          <div className="py-2 px-4 border-b border-gray-200 bg-white flex-shrink-0 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">DECL JSON</h2>
            {!isGenerating && (
              <span className="text-xs text-gray-500">Edit to test renderer</span>
            )}
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              defaultLanguage="json"
              value={jsonText || ''}
              onChange={handleEditorChange}
              theme="vs-light"
              options={{
                readOnly: isGenerating,
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: 'on',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
