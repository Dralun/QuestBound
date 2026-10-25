import type { NuxtUIOptions } from '@nuxt/ui/vite'
import { bundledIcons } from './utils/icons.ts'

export default {
  router: false,
  colorMode: false,
  autoImport: false,
  components: false,
  dts: false,
  icon: { mode: 'svg', clientBundle: { icons: bundledIcons, scan: true, sizeLimitKb: 256 } },
  ui: {
    colors: { primary: 'amber', neutral: 'neutral' },
    icons: {
      loading: 'i-game-icons-rolling-energy',
      close: 'i-game-icons-cancel',
      chevronDown: 'i-game-icons-direction-sign',
      check: 'i-game-icons-check-mark',
      minus: 'i-game-icons-plain-arrow',
      plus: 'i-game-icons-medical-pack',
      arrowLeft: 'i-game-icons-return-arrow',
      arrowRight: 'i-game-icons-plain-arrow',
      external: 'i-game-icons-plain-arrow',
    },
    button: { slots: { base: 'font-semibold' } },
  },
} satisfies NuxtUIOptions
