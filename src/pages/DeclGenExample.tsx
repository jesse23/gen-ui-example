import { useState, useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import DeclGenComponent from '../components/DeclGenComponent'
import { getPageMetadata } from './pages'
import { Button } from '../components/ui/button'
import { generate, type DeclStructure } from '../services/declCodeGenerator'

export const pageMetadata = getPageMetadata('/decl-gen')!

const DEFAULT_PROMPT = "A form to create a LinkdIn Profile, with all the required and optional fields"

// Try to parse JSON incrementally, return null if invalid
// Smart parsing: finds last complete element in array and parses up to that point
function tryParseJSON(text: string): DeclStructure | null {
  if (!text.trim()) return null
  
  // Extract JSON from markdown code blocks if present
  let jsonText = text
  const jsonBlockRegex = /```(?:json)?\s*\n([\s\S]*?)(?:```|$)/
  const match = text.match(jsonBlockRegex)
  if (match && match[1]) {
    jsonText = match[1].trim()
  }
  
  // Find the start of the array
  const arrayStart = jsonText.indexOf('[')
  if (arrayStart === -1) return null
  
  // Get everything from the opening bracket
  let arrayContent = jsonText.substring(arrayStart + 1)
  
  // Find the last complete object in the array
  // We'll count braces to find where a complete object ends
  let braceCount = 0
  let inString = false
  let escapeNext = false
  let lastCompleteIndex = -1
  
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
    
    if (char === '"' && !escapeNext) {
      inString = !inString
      continue
    }
    
    if (inString) continue
    
    if (char === '{') {
      braceCount++
    } else if (char === '}') {
      braceCount--
      // When braces are balanced and we hit a comma or end, we have a complete object
      if (braceCount === 0) {
        // Check if this is followed by comma or end of array
        const nextNonWhitespace = arrayContent.substring(i + 1).match(/^\s*([,}\]]|$)/)
        if (nextNonWhitespace) {
          lastCompleteIndex = i + 1
        }
      }
    }
  }
  
  // If we found a complete element, try to parse up to that point
  if (lastCompleteIndex > 0) {
    const completeArray = '[' + arrayContent.substring(0, lastCompleteIndex).trim() + ']'
    try {
      return JSON.parse(completeArray)
    } catch (e) {
      // If parsing fails, continue to try full parse
    }
  }
  
  // Try to parse the whole thing (might be complete now)
  try {
    const fullArray = '[' + arrayContent.trim()
    // If it doesn't end with ], try adding it
    const trimmed = fullArray.trim()
    const toParse = trimmed.endsWith(']') ? trimmed : trimmed + ']'
    return JSON.parse(toParse)
  } catch (e) {
    // JSON is incomplete or invalid, return null
    return null
  }
}

export default function DeclGenExample() {
  const [prompt, setPrompt] = useState<string | null>(null)
  const [generationKey, setGenerationKey] = useState<number>(0)
  const [inputValue, setInputValue] = useState(DEFAULT_PROMPT)
  const [jsonText, setJsonText] = useState<string>('')
  const [declStructure, setDeclStructure] = useState<DeclStructure | null | undefined>([])
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
          console.log('streamedText', streamedText)
          const parsed = tryParseJSON(streamedText)
          if (parsed) {
            console.log('parsed', parsed)
            setDeclStructure(parsed)
          }
          setJsonText(streamedText)
        }
      })
        .then((result) => {
          // Ignore if this is not the active run anymore
          if (activeRunRef.current !== currentRun) {
            console.log('Ignoring result from cancelled run:', currentRun)
            return
          }
          
          console.log('Setting final result for run:', currentRun)
          setDeclStructure(result)
          setJsonText(JSON.stringify(result, null, 2))
        })
        .catch((err) => {
          // Ignore errors if this is not the active run anymore
          if (activeRunRef.current !== currentRun) {
            console.log('Ignoring error from cancelled run:', currentRun)
            return
          }
          
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
