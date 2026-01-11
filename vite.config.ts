import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import path from 'path'

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
          res.setHeader('Content-Security-Policy', "script-src 'self' blob:")
        }
        next()
      })
    },
  }
}


// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isBuild = command === 'build'
  
  return {
    // If your GitHub Pages repo is at username.github.io/repo-name, set base to '/repo-name/'
    // If it's at username.github.io (root), set base to '/'
    base: '/gen-ui-example/',
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']],
        },
      }),
      cspHeadersPlugin(),
    ],
    build: {
      outDir: 'docs',
    },
    // Exclude VITE_OPENAI_API_KEY from production build only
    // This ensures the API key from .env.local is not included in the build
    // During dev/debug, the API key from .env.local will be available
    ...(isBuild && {
      define: {
        'import.meta.env.VITE_OPENAI_API_KEY': JSON.stringify(''),
      },
    }),
    resolve: {
      alias: [
        {
          find: '@/lib/utils',
          replacement: path.resolve(__dirname, './src/services/shadCnUtils.ts'),
        },
        {
          find: '@',
          replacement: path.resolve(__dirname, './src'),
        },
        {
          find: 'monaco-editor',
          replacement: 'monaco-editor/esm/vs/editor/editor.api.js',
        },
      ],
    },
  }
})
