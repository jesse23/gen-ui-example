import React, { StrictMode, useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { compileTemplate } from './services/compiler'
import { loadComponent } from './services/components'

// Expose React, hooks, and compileTemplate to window for blob components
;(window as any).React = React
;(window as any).useState = useState
;(window as any).useEffect = useEffect
;(window as any).useRef = useRef
;(window as any).compileTemplate = compileTemplate
;(window as any).loadComponent = loadComponent

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
