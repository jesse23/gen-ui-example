import { useState } from 'react'
import DeclComponent from './components/DeclComponent'
import { ENGINE_TYPES, type EngineType } from './services/compiler'
import './App.css'

function App() {
  const [engineType, setEngineType] = useState<EngineType>(ENGINE_TYPES.INLINE)

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
          <span>Engine Type:</span>
          <select
            value={engineType}
            onChange={(e) => setEngineType(e.target.value as EngineType)}
            style={{
              padding: '4px 8px',
              fontSize: '14px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          >
            <option value={ENGINE_TYPES.INLINE}>Inline (Direct Evaluation)</option>
            <option value={ENGINE_TYPES.SANDBOX}>Sandbox (Iframe Isolation)</option>
          </select>
        </label>
        <span style={{ 
          fontSize: '12px', 
          color: '#666',
          fontStyle: 'italic'
        }}>
          {engineType === ENGINE_TYPES.INLINE ? 'Direct evaluation' : 'Sandboxed evaluation'}
        </span>
      </div>
      <DeclComponent src="example" engineType={engineType} />
    </div>
  )
}

export default App
