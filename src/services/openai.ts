/**
 * OpenAI API Service
 * 
 * Shared service for making OpenAI API calls with support for streaming and non-streaming responses.
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Global API key variable - can be set by user via UI
 * Falls back to environment variable if not set
 */
let globalApiKey: string | null = null

/**
 * Get OpenAI API key from environment variables
 * Supports both Vite (import.meta.env) and Node.js (globalThis.process.env) environments
 */
function getApiKeyFromEnv(): string | null {
  return (
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OPENAI_API_KEY) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.VITE_OPENAI_API_KEY) ||
    null
  )
}

/**
 * Get the current API key (from global variable or environment)
 * @returns API key string or null if not available
 */
export function getApiKey(): string | null {
  return globalApiKey || getApiKeyFromEnv()
}

/**
 * Set the API key globally (from user input)
 * @param apiKey - The API key to set, or null to clear it
 */
export function setApiKey(apiKey: string | null): void {
  globalApiKey = apiKey
}

/**
 * Get the API key from environment (for initializing the modal)
 * @returns API key string or null if not available
 */
export function getApiKeyFromEnvironment(): string | null {
  return getApiKeyFromEnv()
}

/**
 * Initialize the global API key from environment variable
 * Should be called on app startup
 */
export function initializeApiKey(): void {
  const envKey = getApiKeyFromEnv()
  if (envKey) {
    globalApiKey = envKey
  }
}

/**
 * Get OpenAI model from environment variables
 * Defaults to 'gpt-4o-mini' if not specified
 */
function getModel(): string {
  return (
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_OPENAI_MODEL) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.VITE_OPENAI_MODEL) ||
    'gpt-4o-mini'
  )
}

// ============================================================================
// Update Callback
// ============================================================================

/**
 * Update callback for streaming responses
 */
export type UpdateCallback = (update: { type: 'replace' | 'append'; text: string }) => void

// ============================================================================
// OpenAI API Calls
// ============================================================================

/**
 * Call OpenAI API with streaming support
 * 
 * @param userPrompt - User's prompt message
 * @param systemPrompt - System prompt message
 * @param onUpdate - Optional callback for streaming updates
 * @returns Promise that resolves to the full response content
 */
export async function callOpenAIStreaming(
  userPrompt: string,
  systemPrompt: string,
  onUpdate?: UpdateCallback
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('OpenAI API key is required. Please set it in the settings.')
  }
  const model = getModel()

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      stream: true,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } })) as { error?: { message?: string } }
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`)
  }

  if (!response.body) {
    throw new Error('No response body from OpenAI')
  }

  // Read streaming response
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let isFirstChunk = true

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        if (trimmed === 'data: [DONE]') continue

        try {
          const data = JSON.parse(trimmed.slice(6))
          const delta = data.choices?.[0]?.delta?.content
          if (delta) {
            fullContent += delta
            if (onUpdate) {
              if (isFirstChunk) {
                onUpdate({ type: 'replace', text: delta })
                isFirstChunk = false
              } else {
                onUpdate({ type: 'append', text: delta })
              }
            }
          }
        } catch (e) {
          // Skip invalid JSON lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!fullContent) {
    throw new Error('No content in OpenAI response')
  }

  return fullContent
}

/**
 * Call OpenAI API without streaming (standard request)
 * 
 * @param userPrompt - User's prompt message
 * @param systemPrompt - System prompt message
 * @returns Promise that resolves to the response content
 */
export async function callOpenAI(
  userPrompt: string,
  systemPrompt: string
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('OpenAI API key is required. Please set it in the settings.')
  }
  const model = getModel()

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } })) as { error?: { message?: string } }
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`)
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('No content in OpenAI response')
  }

  return content
}
