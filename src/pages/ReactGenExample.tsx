import { useState } from 'react'
import ReactGenComponent from '../components/ReactGenComponent'
import { getPageMetadata } from './pages'
import { Button } from '../components/ui/button'

export const pageMetadata = getPageMetadata('/react-gen')!

const DEFAULT_PROMPT = "A form to create a LinkdIn Profile, with all the required and optional fields"

export default function ReactGenExample() {
  const [prompt, setPrompt] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState(DEFAULT_PROMPT)

  const handleGenerate = () => {
    setPrompt(inputValue)
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
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
      <div className="flex-1 overflow-hidden">
        <ReactGenComponent prompt={prompt} />
      </div>
    </div>
  )
}
