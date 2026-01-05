import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Plugin to set CSP headers conditionally for preview server only
function cspHeadersPlugin(): Plugin {
  return {
    name: 'csp-headers',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        // Allow blob: for sandbox files to execute dynamic code
        if (req.url === '/sandbox.html' || req.url === '/sandbox.js') {
          res.setHeader(
            'Content-Security-Policy',
            "script-src 'self' blob:"
          )
        } else {
          // Default CSP for main page - strict, no unsafe-eval
          res.setHeader('Content-Security-Policy', "script-src 'self'")
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    cspHeadersPlugin(),
  ],
})
