// Components a module's manifest names (`core.account-section`, `core.record-tab`, `core.home-card`)
// are registered globally, so the page can resolve them by name: any layer's `app/account-sections`,
// `app/record-tabs`, `app/record-facts`, `app/list-columns` and `app/home-cards`, by file name.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { addComponentsDir, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'proscenium-account-sections' },
  setup(_options, nuxt) {
    for (const layer of nuxt.options._layers) {
      for (const folder of ['account-sections', 'record-tabs', 'record-facts', 'list-columns', 'home-cards']) {
        const path = join(layer.config.srcDir ?? layer.cwd, folder)
        if (existsSync(path)) addComponentsDir({ path, global: true, pathPrefix: false })
      }
    }
  },
})
