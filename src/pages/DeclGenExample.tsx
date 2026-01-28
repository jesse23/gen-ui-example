import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import DeclGenComponent from '../components/react/DeclGenComponent'
import { getPageMetadata } from './pages'
import { Button } from '../components/ui/button'
import { generate, type DeclStreamResponse, type DeclAggregatedResponse, type DeclStructure } from '../services/declCodeGenerator'

export const pageMetadata = getPageMetadata('/decl-gen')!

const DEFAULT_PROMPT = "A form to create a LinkdIn Profile, with all the required and optional fields"

// Try to parse JSON incrementally. Returns array of chunks so far, or null if nothing valid.
// Supports: (1) array of chunks [{ "view": [...] }, { "data": {} }], (2) single object { "view": [...], "data": {} }.
function tryParseJSON(text: string): DeclStreamResponse | null {
  if (!text.trim()) return null

  let jsonText = text
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)(?:```|$)/
  const match = text.match(jsonBlockRegex)
  if (match && match[1]) {
    jsonText = match[1].trim()
  }

  // --- Array format: [ { "view": [...] }, { "data": {} }, ... ] ---
  const arrayStart = jsonText.indexOf('[')
  if (arrayStart !== -1) {
    const arrayContent = jsonText.substring(arrayStart + 1)
    let braceCount = 0
    let inString = false
    let escapeNext = false
    let lastCompleteEnd = -1

    for (let i = 0; i < arrayContent.length; i++) {
      const char = arrayContent[i]
      if (escapeNext) {
        escapeNext = false
        continue
      }
      if (char === '\\') {
        escapeNext = true
        continue
      }
      if (char === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (char === '{') {
        braceCount++
      } else if (char === '}') {
        braceCount--
        if (braceCount === 0) {
          lastCompleteEnd = i + 1
        }
      }
    }

    if (lastCompleteEnd > 0) {
      const raw = arrayContent.substring(0, lastCompleteEnd).trim().replace(/,\s*$/, '')
      try {
        const parsed = JSON.parse('[' + raw + ']') as DeclStreamResponse
        if (Array.isArray(parsed)) {
          return expandViewChunks(parsed)
        }
      } catch (_) {
        // fall through
      }
    }

    // Whole array might be complete (ends with ])
    const trimmed = jsonText.substring(arrayStart).trim()
    if (trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as DeclStreamResponse
        if (Array.isArray(parsed)) {
          return expandViewChunks(parsed)
        }
      } catch (_) {
        // fall through
      }
    }
  }

  // --- Object format: { "view": [...], "data": {} } ---
  const objectStart = jsonText.indexOf('{')
  if (objectStart !== -1) {
    let depth = 0
    let inString = false
    let escapeNext = false
    let endIndex = -1
    for (let i = objectStart; i < jsonText.length; i++) {
      const char = jsonText[i]
      if (escapeNext) {
        escapeNext = false
        continue
      }
      if (char === '\\') {
        escapeNext = true
        continue
      }
      if (char === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) {
          endIndex = i + 1
          break
        }
      }
    }
    if (endIndex > 0) {
      try {
        const parsed = JSON.parse(jsonText.substring(0, endIndex).trim()) as { view?: unknown[]; data?: Record<string, unknown> }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const chunks: DeclStreamResponse = []
          if (Array.isArray(parsed.view)) {
            chunks.push({ view: parsed.view as DeclStructure })
          }
          if (parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
            chunks.push({ data: parsed.data })
          }
          return chunks.length > 0 ? expandViewChunks(chunks) : null
        }
      } catch (_) {
        // fall through
      }
    }
  }

  return null
}

// Expand one chunk with view: [a,b,c] into [ { view: [a] }, { view: [b] }, { view: [c] } ] so
// DeclGenComponent appends each and we get correct aggregation even when AI sends one big view chunk.
function expandViewChunks(chunks: DeclStreamResponse): DeclStreamResponse {
  const out: DeclStreamResponse = []
  for (const ch of chunks) {
    if (!ch || typeof ch !== 'object') continue
    if ('view' in ch && Array.isArray(ch.view)) {
      for (const el of ch.view) {
        out.push({ view: [el] })
      }
      continue
    }
    if ('data' in ch && ch.data && typeof ch.data === 'object' && !Array.isArray(ch.data)) {
      out.push({ data: ch.data })
    }
  }
  return out
}

export default function DeclGenExample() {
  const [prompt, setPrompt] = useState<string | null>(null)
  const [generationKey, setGenerationKey] = useState<number>(0)
  const [inputValue, setInputValue] = useState(DEFAULT_PROMPT)
  const [jsonText, setJsonText] = useState<string>('')
  const [declStructure, setDeclStructure] = useState<DeclStreamResponse | DeclAggregatedResponse | null | undefined>([])
  const [error, setError] = useState<string | null>(null)
  const effectRunRef = useRef<number>(0)
  const activeRunRef = useRef<number | null>(null)

  useEffect(() => {
    if (!prompt) return

    // Track this effect run
    const currentRun = ++effectRunRef.current
    
    // Reset state for this new generation immediately
    setError(null)
    setDeclStructure(undefined)
    setJsonText('')
    
    // Use a microtask to ensure only the last Strict Mode invocation proceeds
    Promise.resolve().then(() => {
      // Check if this is still the latest run after microtask
      if (currentRun !== effectRunRef.current) return
      
      // Mark this as the active run
      activeRunRef.current = currentRun
      
      let streamedText = ''
      
      // Generate DECL structure with streaming
      generate(prompt, {
        onUpdate: ({ type, text }) => {
          if (activeRunRef.current !== currentRun) return
          
          if (type === 'replace') {
            streamedText = text
          } else {
            streamedText += text
          }
          
          // Try to parse incrementally and update structure
          const parsed = tryParseJSON(streamedText)
          if (parsed) {
            setDeclStructure(parsed)
          }
          setJsonText(streamedText)
        }
      })
        .then((result) => {
          if (activeRunRef.current !== currentRun) return
          // Final result is aggregated { view, data }; component will replace streamed array with it
          setDeclStructure(result)
          setJsonText(JSON.stringify(result, null, 2))
        })
        .catch((err) => {
          if (activeRunRef.current !== currentRun) return
          
          console.error('Error generating DECL structure:', err)
          setError(err.message || 'Failed to generate DECL structure')
          setDeclStructure(null)
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
    setDeclStructure(undefined)
    // Cancel any previous runs by clearing the active run
    activeRunRef.current = null
    // Set prompt and increment generation key to force effect re-run
    // This ensures the effect runs even if the prompt value is the same
    setPrompt(inputValue)
    setGenerationKey(prev => prev + 1)
  }

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
          <Button variant="default" onClick={handleGenerate}>
            Generate
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
              <DeclGenComponent 
                key={declStructure ? JSON.stringify(declStructure).slice(0, 100) : 'empty'} 
                declStructure={declStructure} 
              />
            )}
          </div>
        </div>

        {/* Right Panel - Generated JSON */}
        <div className="w-1/2 flex flex-col">
          <div className="py-2 px-4 border-b border-gray-200 bg-white flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-800">Generated DECL JSON</h2>
          </div>
          <div className="flex-1">
            <Editor
              height="100%"
              defaultLanguage="json"
              value={jsonText || ''}
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
    </div>
  )
}
