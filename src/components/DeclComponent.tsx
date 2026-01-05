import React, { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import { compileTemplate, type TemplateConfig, type EngineType } from '../services/compiler'

interface DeclComponentProps {
  src: string
  engineType?: EngineType
}

function DeclComponent({ src, engineType }: DeclComponentProps) {
  const [Component, setComponent] = useState<React.ComponentType | null>(null)

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
      .then((text) => {
        const parsed = yaml.load(text) as TemplateConfig
        // Override engineType from props if provided
        if (engineType !== undefined) {
          parsed.engineType = engineType
        }
        // Compile the template into a React component
        const CompiledComponent = compileTemplate(parsed)
        setComponent(() => CompiledComponent)
      })
      .catch((error) => {
        console.error('Error loading template:', error)
      })
  }, [src, engineType])

  if (!Component) {
    return <div>Loading...</div>
  }

  return <Component />
}

export default DeclComponent


