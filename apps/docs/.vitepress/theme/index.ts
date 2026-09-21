import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import Workbench from '../../src/Workbench.vue'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Workbench', Workbench)
  },
} satisfies Theme
