// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    projects: [
      // ── Main process tests (Node environment) ────────────────────────────────
      {
        test: {
          name: 'main',
          environment: 'node',
          include: ['src/main/**/*.test.ts'],
        },
        resolve: {
          alias: {
            '@shared': resolve(__dirname, 'shared'),
          },
        },
      },
      // ── Renderer tests (jsdom environment) ──────────────────────────────────
      {
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/src/**/*.test.{ts,tsx}'],
          globals: true,
          setupFiles: ['src/renderer/src/__tests__/setup.ts'],
        },
        resolve: {
          alias: {
            '@shared': resolve(__dirname, 'shared'),
            '@renderer': resolve(__dirname, 'src/renderer/src'),
          },
        },
      },
    ],
  },
})
