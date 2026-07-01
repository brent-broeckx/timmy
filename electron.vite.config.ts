import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('shared'),
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('shared'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
