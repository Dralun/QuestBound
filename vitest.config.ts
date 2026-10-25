import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import uiConfig from './app/ui.config.ts'

export default defineConfig({
  plugins: [vue(), ui(uiConfig)],
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'app/app.vue',
        'app/composables/**',
        'app/stores/**',
        'app/services/**',
        'app/utils/**',
        'app/components/**',
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 80 },
    },
  },
})
