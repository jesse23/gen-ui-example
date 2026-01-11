import React, { useState, useEffect } from 'react'
import { generateUI } from '../services/genui'

function AiComponentExample() {
  const [Component, setComponent] = useState<React.ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const prompt = "a form to confirm yes or no to 'do you want to continue?'"
    
    setLoading(true)
    setError(null)
    
    generateUI(prompt)
      .then((GeneratedComponent) => {
        setComponent(() => GeneratedComponent)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error generating UI:', err)
        setError(err.message || 'Failed to generate UI')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-600">Generating UI component...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <div className="text-red-800 font-semibold mb-2">Error</div>
        <div className="text-red-600">{error}</div>
        <div className="text-sm text-red-500 mt-2">
          Make sure VITE_OPENAI_API_KEY is set in your environment variables.
        </div>
      </div>
    )
  }

  if (!Component) {
    return (
      <div className="p-4 text-gray-600">No component generated</div>
    )
  }

  return (
    <div className="p-4">
      <Component />
    </div>
  )
}

export default AiComponentExample
