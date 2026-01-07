import { useState } from 'react'
import DeclComponent from './components/DeclComponent'
import { COMPILATION_STRATEGIES, type CompilationStrategy } from './services/compiler'
import './App.css'

function App() {
  const [compilationStrategy, setCompilationStrategy] = useState<CompilationStrategy>(COMPILATION_STRATEGIES.INLINE)

  return (
    <div>
      <div style={{ 
        padding: '10px', 
        borderBottom: '1px solid #ccc', 
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>Compilation Strategy:</span>
          <select
            value={compilationStrategy}
            onChange={(e) => setCompilationStrategy(e.target.value as CompilationStrategy)}
            style={{
              padding: '4px 8px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          >
            <option value={COMPILATION_STRATEGIES.INLINE}>Inline (Direct Evaluation)</option>
            <option value={COMPILATION_STRATEGIES.SANDBOX}>Sandbox (Iframe Isolation)</option>
            <option value={COMPILATION_STRATEGIES.BLOB}>Blob (Static Compilation)</option>
          </select>
        </label>
        <span style={{ 
          fontSize: '12px', 
          color: '#666',
          fontStyle: 'italic'
        }}>
          {compilationStrategy === COMPILATION_STRATEGIES.INLINE ? 'Direct evaluation' : 
           compilationStrategy === COMPILATION_STRATEGIES.SANDBOX ? 'Sandboxed evaluation' : 
           'Static blob compilation'}
        </span>
      </div>
      <DeclComponent src="example" compilationStrategy={compilationStrategy} />
    </div>
  )
}

export default App
