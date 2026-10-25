import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ui from '@nuxt/ui/vue-plugin'
import App from './app.vue'
import { createLiveTransport } from './services/api'
import { useGameStore } from './stores/game'
import './assets/css/main.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(ui)
useGameStore(pinia).setTransport(createLiveTransport(import.meta.env.VITE_GAME_API_URL))
app.mount('#app')
