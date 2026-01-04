import React, { useState, useEffect } from 'react'
import yaml from 'js-yaml'
import { compileTemplate, type TemplateConfig } from '../services/compiler'

interface DeclComponentProps {
  src: string
  unsafeEval?: boolean
}

function DeclComponent({ src, unsafeEval }: DeclComponentProps) {
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
        // Override unsafeEval from props if provided
        if (unsafeEval !== undefined) {
          parsed.unsafeEval = unsafeEval
        }
        // Compile the template into a React component
        const CompiledComponent = compileTemplate(parsed)
        setComponent(() => CompiledComponent)
      })
      .catch((error) => {
        console.error('Error loading template:', error)
      })
  }, [src, unsafeEval])

  if (!Component) {
    return <div>Loading...</div>
  }

  return <Component />
}

export default DeclComponent


