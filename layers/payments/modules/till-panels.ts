// A till panel (payments.desk-basket) names its component, which the till resolves by name: so every
// layer's `app/till-panels` folder is registered globally, by file name, as core does for its
// account sections and home cards.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { addComponentsDir, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'proscenium-till-panels' },
  setup(_options, nuxt) {
    for (const layer of nuxt.options._layers) {
      const path = join(layer.config.srcDir ?? layer.cwd, 'till-panels')
      if (existsSync(path)) addComponentsDir({ path, global: true, pathPrefix: false })
    }
  },
})
