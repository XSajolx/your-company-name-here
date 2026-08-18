import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Served from https://xsajolx.github.io/your-company-name-here/ on GitHub Pages;
  // root during local dev.
  base: command === 'build' ? '/your-company-name-here/' : '/',
  resolve: {
    alias: {
      // Demo build: replace the real Supabase SDK with an in-browser mock so the
      // app runs fully offline with generated data and no env vars / backend.
      '@supabase/supabase-js': path.resolve(__dirname, 'src/mocks/mockSupabase.js'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
}))
