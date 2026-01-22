import React, { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import { compileTemplate, type ComponentDefinition, type CompilationStrategy, COMPILATION_STRATEGIES } from '../../services/compiler'

interface DeclComponentProps {
  src: string
  compilationStrategy?: CompilationStrategy
}

function DeclComponent({ src, compilationStrategy }: DeclComponentProps) {
  const [Component, setComponent] = useState<React.ComponentType | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Construct path to template: {base}/templates/{src}.yml
    // Templates are in public/templates directory (available in both dev and build)
    const base = import.meta.env.BASE_URL
    const templatePath = `${base}templates/${src}.yml`
    
    // Load and parse YAML
    fetch(templatePath)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load template: ${res.statusText}`)
        }
        return res.text()
      })
      .then(async (text) => {
        const parsed = yaml.load(text) as ComponentDefinition
        const effectiveStrategy = compilationStrategy || COMPILATION_STRATEGIES.BLOB
        
        // Use unified compileTemplate API for all compilation strategies
        const CompiledComponent = await compileTemplate(parsed, effectiveStrategy)
        setComponent(() => CompiledComponent)
      })
      .catch((err) => {
        console.error('Error loading template:', err)
        setError(err.message)
      })
  }, [src, compilationStrategy])

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>
  }

  if (!Component) {
    return <div>Loading...</div>
  }

  return <Component />
}

export default DeclComponent


