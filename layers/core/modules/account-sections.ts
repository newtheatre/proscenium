// A module's account sections are components named in its manifest (`core.account-section`), so
// they are registered globally: any layer's `app/account-sections`, by file name.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { addComponentsDir, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: { name: 'proscenium-account-sections' },
  setup(_options, nuxt) {
    for (const layer of nuxt.options._layers) {
      const path = join(layer.config.srcDir ?? layer.cwd, 'account-sections')
      if (existsSync(path)) addComponentsDir({ path, global: true, pathPrefix: false })
    }
  },
})
