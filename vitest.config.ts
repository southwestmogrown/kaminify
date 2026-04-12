import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    setupFiles: ['@testing-library/jest-dom/vitest'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts', 'src/components/**/*.tsx'],
      exclude: [
        'src/lib/types.ts',
        'src/lib/site-storage.ts',  // heavy Supabase integration — tested via API route tests
        'src/lib/auth.ts',          // Clerk integration — tested via API route auth tests
        'src/lib/api-key-crypto.ts', // crypto integration — tested via API route tests
        'src/lib/stripe.ts',        // Stripe integration — tested in webhook route
        'src/components/GeneratingAnimation.tsx', // pure visual Three.js animation — no logic to test
      ],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
