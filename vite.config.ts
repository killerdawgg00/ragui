import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev proxy: requests to /rag/* are forwarded to RAG_TARGET (avoids CORS).
// e.g. RAG_TARGET=http://localhost:8000 npm run dev, then use endpoint "/rag/query"
const target = process.env.RAG_TARGET ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/rag': {
        target,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rag/, ''),
      },
    },
  },
})
