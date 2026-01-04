import React, { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import { compileTemplate, type TemplateConfig } from '../services/compiler'

interface DeclComponentProps {
  src: string
}

function DeclComponent({ src }: DeclComponentProps) {
  const [Component, setComponent] = useState<React.ComponentType | null>(null)

  useEffect(() => {
    // Construct path to template: src/templates/{src}.yml
    // Only allow loading from src/templates directory
    const templatePath = `./src/templates/${src}.yml`
    
    // Load and parse YAML
    fetch(templatePath)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load template: ${res.statusText}`)
        }
        return res.text()
      })
      .then((text) => {
        const parsed = yaml.load(text) as TemplateConfig
        // Compile the template into a React component
        const CompiledComponent = compileTemplate(parsed)
        setComponent(() => CompiledComponent)
      })
      .catch((error) => {
        console.error('Error loading template:', error)
      })
  }, [src])

  if (!Component) {
    return <div>Loading...</div>
  }

  return <Component />
}

export default DeclComponent


