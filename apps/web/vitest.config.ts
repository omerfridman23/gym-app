import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      'next/navigation': path.resolve(import.meta.dirname, 'src/shims/next-navigation.ts'),
      'next/link': path.resolve(import.meta.dirname, 'src/shims/next-link.tsx'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.{ts,tsx}'],
  },
})
