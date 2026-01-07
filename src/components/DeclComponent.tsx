import React, { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import { compileTemplate, type TemplateConfig, type EngineType, ENGINE_TYPES } from '../services/compiler'
import { generateComponentCode } from '../services/staticCompile'

interface DeclComponentProps {
  src: string
  engineType?: EngineType
}

function DeclComponent({ src, engineType }: DeclComponentProps) {
  const [Component, setComponent] = useState<React.ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Construct path to template: /templates/{src}.yml
    // Templates are in public/templates directory (available in both dev and build)
    const templatePath = `/templates/${src}.yml`
    
    // Load and parse YAML
    fetch(templatePath)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load template: ${res.statusText}`)
        }
        return res.text()
      })
      .then(async (text) => {
        const parsed = yaml.load(text) as TemplateConfig
        // Override engineType from props if provided
        if (engineType !== undefined) {
          parsed.engineType = engineType
        }
        
        const effectiveEngineType = parsed.engineType || ENGINE_TYPES.INLINE
        
        // Handle blob compilation
        if (effectiveEngineType === ENGINE_TYPES.BLOB) {
          // Generate JavaScript code from the template
          const componentCode = generateComponentCode(parsed)
          
          // Create a blob from the code
          const blob = new Blob([componentCode], { type: 'application/javascript' })
          const blobUrl = URL.createObjectURL(blob)
          
          try {
            // Dynamically import the blob
            const module = await import(/* @vite-ignore */ blobUrl)
            const CompiledComponent = module.default
            if (CompiledComponent) {
              setComponent(() => CompiledComponent)
            } else {
              throw new Error('Component export not found in blob')
            }
          } finally {
            // Clean up blob URL
            URL.revokeObjectURL(blobUrl)
          }
        } else {
          // Use regular compilation
          const CompiledComponent = compileTemplate(parsed)
          setComponent(() => CompiledComponent)
        }
      })
      .catch((err) => {
        console.error('Error loading template:', err)
        setError(err.message)
      })
  }, [src, engineType])

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>
  }

  if (!Component) {
    return <div>Loading...</div>
  }

  return <Component />
}

export default DeclComponent


