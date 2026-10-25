import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import uiConfig from './app/ui.config.ts'
import { normalizeApiUrl } from './app/utils/apiUrl.ts'

export default defineConfig(({ mode, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (!isPreview) normalizeApiUrl(env.VITE_GAME_API_URL)

  return {
    base: `${(env.VITE_BASE_PATH || '/').replace(/\/+$/, '')}/`,
    plugins: [vue(), ui(uiConfig)],
  }
})
