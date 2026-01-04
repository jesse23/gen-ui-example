import { useState } from 'react'
import DeclComponent from './components/DeclComponent'
import './App.css'

function App() {
  const [unsafeEval, setUnsafeEval] = useState(false)

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
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={unsafeEval}
            onChange={(e) => setUnsafeEval(e.target.checked)}
          />
          <span>Use unsafe eval (unchecked = iframe sandbox mode)</span>
        </label>
        <span style={{ 
          fontSize: '12px', 
          color: '#666',
          fontStyle: 'italic'
        }}>
          {unsafeEval ? 'Direct evaluation' : 'Sandboxed evaluation'}
        </span>
      </div>
      <DeclComponent src="example" unsafeEval={unsafeEval} />
    </div>
  )
}

export default App
