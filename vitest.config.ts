import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom simula un navegador en Node.js — necesario para testear componentes React
    environment: 'jsdom',
    // Ejecuta este fichero antes de cada test (configura @testing-library)
    setupFiles: ['./src/test/setup.ts'],
    // Permite usar describe/it/expect sin importarlos explícitamente (como en xUnit)
    globals: true,
    // No falla con código 1 cuando no hay tests — útil durante el desarrollo inicial
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      // Mismo alias que en vite.config.ts — para que los imports @/... funcionen en tests
      '@': path.resolve(__dirname, './src'),
    },
  },
})
