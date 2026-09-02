import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = import.meta.dirname

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      // The v0 UI code imports next/link and next/navigation; alias them
      // to react-router shims so v0 files stay unchanged (see src/shims).
      'next/link': path.resolve(root, 'src/shims/next-link.tsx'),
      'next/navigation': path.resolve(root, 'src/shims/next-navigation.ts'),
    },
  },
  server: {
    port: 5173,
  },
})
