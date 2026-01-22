import { useState, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import DeclComponent from '../components/react/DeclComponent'
import { COMPILATION_STRATEGIES } from '../services/compiler'
import { getPageMetadata } from './pages'

export const pageMetadata = getPageMetadata('/decl')!

export default function DeclExample() {
  const [yamlContent, setYamlContent] = useState<string>('')
  const templateName = 'SamplePanel'

  useEffect(() => {
    // Load YAML file
    const base = import.meta.env.BASE_URL
    fetch(`${base}templates/${templateName}.yml`)
      .then(res => res.text())
      .then(text => setYamlContent(text))
      .catch(err => console.error('Failed to load template:', err))
  }, [templateName])

  return (
    <div className="h-screen bg-gray-50 flex">
      {/* Left Panel - Monaco Editor */}
      <div className="w-1/2 border-r border-gray-200 flex flex-col">
        <div className="py-2 px-4 border-b border-gray-200 bg-white">
          <h2 className="text-sm font-semibold text-gray-800">Template Editor</h2>
        </div>
        <div className="flex-1">
          <Editor
            height="100%"
            defaultLanguage="yaml"
            value={yamlContent}
            theme="vs-light"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
            }}
          />
        </div>
      </div>

      {/* Right Panel - Component Preview */}
      <div className="w-1/2 flex flex-col">
        <div className="py-2 px-4 border-b border-gray-200 bg-white">
          <h2 className="text-sm font-semibold text-gray-800">Preview</h2>
        </div>
        <div className="flex-1 overflow-auto p-8 bg-white">
          <DeclComponent src={templateName} compilationStrategy={COMPILATION_STRATEGIES.BLOB} />
        </div>
      </div>
    </div>
  )
}
