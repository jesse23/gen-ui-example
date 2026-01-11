// Global storage for execution results (keyed by request ID)
window.__sandboxResults = window.__sandboxResults || {};

// Helper function to execute code via Blob URL (CSP-compliant alternative to new Function)
function executeViaBlob(code, contextObj, resultId) {
  return new Promise((resolve, reject) => {
    try {
      // Build parameter names
      const paramNames = Object.keys(contextObj);
      
      // Serialize context values for injection into the blob script
      // We need to handle different types properly and create variable assignments
      const contextAssignments = paramNames.map(name => {
        const value = contextObj[name];
        // Serialize the value to be injectable into code
        let serializedValue;
        if (typeof value === 'string') {
          serializedValue = JSON.stringify(value);
        } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
          serializedValue = String(value);
        } else {
          serializedValue = JSON.stringify(value);
        }
        return `const ${name} = ${serializedValue};`;
      }).join('\n            ');
      
      // Create code that executes and stores result
      // Inject context variables as const declarations so they're available in the code expression
      const blobCode = `
        (function() {
          try {
            ${contextAssignments}
            const result = (${code});
            window.__sandboxResults['${resultId}'] = { success: true, result: result };
          } catch (error) {
            window.__sandboxResults['${resultId}'] = { success: false, error: error.message };
          }
        })();
      `;
      
      // Create Blob and URL
      const blob = new Blob([blobCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      
      // Create and load script
      const script = document.createElement('script');
      script.src = blobUrl;
      
      script.onload = () => {
        // Check for result after a brief delay to ensure execution completed
        setTimeout(() => {
          const result = window.__sandboxResults[resultId];
          delete window.__sandboxResults[resultId];
          URL.revokeObjectURL(blobUrl);
          document.body.removeChild(script);
          
          if (result) {
            if (result.success) {
              resolve(result.result);
            } else {
              reject(new Error(result.error));
            }
          } else {
            reject(new Error('Execution did not complete'));
          }
        }, 0);
      };
      
      script.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        document.body.removeChild(script);
        delete window.__sandboxResults[resultId];
        reject(new Error('Failed to load script'));
      };
      
      document.body.appendChild(script);
    } catch (error) {
      reject(error);
    }
  });
}

// Global registry for setData callbacks (keyed by request ID)
window.__sandboxSetDataCallbacks = window.__sandboxSetDataCallbacks || {};

// Helper function to execute action code via Blob URL
function executeActionViaBlob(actionCode, data, setDataProxy, resultId) {
  return new Promise((resolve, reject) => {
    try {
      // Register the setData callback globally so blob script can access it
      window.__sandboxSetDataCallbacks[resultId] = setDataProxy;
      
      // Serialize data for injection
      const serializedData = JSON.stringify(data);
      
      // Create code that executes the action
      // The blob script runs in the same window context, so it can access the global callback
      const blobCode = `
        (function() {
          try {
            const data = ${serializedData};
            const setData = window.__sandboxSetDataCallbacks['${resultId}'];
            if (typeof setData !== 'function') {
              throw new Error('setData callback not available');
            }
            const actionFunc = ${actionCode};
            actionFunc(data, setData);
            window.__sandboxResults['${resultId}'] = { success: true };
          } catch (error) {
            window.__sandboxResults['${resultId}'] = { success: false, error: error.message };
          }
        })();
      `;
      
      // Create Blob and URL
      const blob = new Blob([blobCode], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      
      // Create and load script
      const script = document.createElement('script');
      script.src = blobUrl;
      
      script.onload = () => {
        setTimeout(() => {
          const result = window.__sandboxResults[resultId];
          delete window.__sandboxResults[resultId];
          delete window.__sandboxSetDataCallbacks[resultId];
          URL.revokeObjectURL(blobUrl);
          document.body.removeChild(script);
          
          if (result) {
            if (result.success) {
              resolve(null);
            } else {
              reject(new Error(result.error));
            }
          } else {
            reject(new Error('Execution did not complete'));
          }
        }, 0);
      };
      
      script.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        document.body.removeChild(script);
        delete window.__sandboxResults[resultId];
        delete window.__sandboxSetDataCallbacks[resultId];
        reject(new Error('Failed to load script'));
      };
      
      document.body.appendChild(script);
    } catch (error) {
      delete window.__sandboxSetDataCallbacks[resultId];
      reject(error);
    }
  });
}

window.addEventListener('message', function(event) {
  // Accept messages from parent (sandbox has null origin, so we can't check origin)
  // In production, you'd want additional validation here
  if (!event.data) {
    return;
  }
  
  const { type, id, code, context, actionCode, data } = event.data;
  
  if (type === 'SANDBOX_EVAL') {
    // Create context object
    const contextObj = {};
    if (context) {
      Object.keys(context).forEach(key => {
        // Only set valid JavaScript identifiers
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
          contextObj[key] = context[key];
        }
      });
    }
    
    // Execute via Blob URL
    executeViaBlob(code, contextObj, id)
      .then(result => {
        // Send result back
        window.parent.postMessage({
          type: 'SANDBOX_RESULT',
          id: id,
          result: result,
          error: null
        }, '*');
      })
      .catch(error => {
        // Send error back with context info for debugging
        const availableKeys = context ? Object.keys(context).filter(k => /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)) : [];
        const errorMsg = error.message + ' (Available context keys: ' + availableKeys.join(', ') + ')';
        window.parent.postMessage({
          type: 'SANDBOX_RESULT',
          id: id,
          result: null,
          error: errorMsg
        }, '*');
      });
  } else if (type === 'SANDBOX_ACTION_EVAL') {
    // Execute action in sandbox
    // setData is provided as a function that posts messages to the host
    // This approach allows setData to communicate with the host via postMessage
    // Note: This is synchronous from the sandbox's perspective, but the host applies
    // updates asynchronously. Side effects that depend on immediate state updates may not work.
    
    // Create setData proxy function that posts to host
    // Functions can't be serialized via postMessage, so we evaluate function form here
    const setDataProxy = function(update) {
      // If update is a function, evaluate it with current data (can't serialize functions)
      const modelUpdate = typeof update === 'function' ? update(data) : update;
      
      // Post message to host
      window.parent.postMessage({
        type: 'SANDBOX_INVOKE_HOST',
        id: id,
        callbackName: 'setData',
        args: [modelUpdate]
      }, '*');
    };
    
    // Execute via Blob URL
    executeActionViaBlob(actionCode, data, setDataProxy, id)
      .then(() => {
        // Signal that action execution completed (setData invocations are handled separately)
        window.parent.postMessage({
          type: 'SANDBOX_ACTION_RESULT',
          id: id,
          error: null
        }, '*');
      })
      .catch(error => {
        window.parent.postMessage({
          type: 'SANDBOX_ACTION_RESULT',
          id: id,
          error: error.message
        }, '*');
      });
  }
});

// Signal that sandbox is ready
window.parent.postMessage({
  type: 'SANDBOX_READY'
}, '*');

