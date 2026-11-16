// The core layer: the kit, the generated registry, the Worker's background handlers and the
// interface's foundations (Nuxt UI v4 on Tailwind CSS v4, as in Mailflare).
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { kitAliases } from './aliases'

const root = fileURLToPath(new URL('../..', import.meta.url))
const publicComponentsFile = fileURLToPath(new URL('../../.generated/public-components.json', import.meta.url))
const generatedTypes = fileURLToPath(new URL('../../.generated/types/registry.d.ts', import.meta.url))

export default defineNuxtConfig({
  app: { head: { htmlAttrs: { lang: 'en-GB' } } },
  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],
  // Turnstile's site key is public; set NUXT_PUBLIC_TURNSTILE_SITE_KEY beside CORE_TURNSTILE_SECRET_KEY.
  runtimeConfig: { public: { turnstileSiteKey: '' } },
  alias: kitAliases(root),
  nitro: {
    typescript: { tsConfig: { include: [generatedTypes], compilerOptions: { types: ['@cloudflare/workers-types'] } } },
  },
  // The app's typed $fetch reads the server routes, and with them the kit's Cloudflare types.
  typescript: { tsConfig: { compilerOptions: { types: ['@cloudflare/workers-types'] } } },
  hooks: {
    // A public component is written in content by its alias (::access-application), so register its
    // file a second time under that name, globally, as Nuxt Content resolves components by name.
    'components:extend'(components) {
      if (!existsSync(publicComponentsFile)) return
      const entries = JSON.parse(readFileSync(publicComponentsFile, 'utf8')) as { component: string, alias: string, module: string }[]
      for (const entry of entries) {
        const found = components.find(c => c.pascalName === entry.component)
        if (!found) {
          console.warn(`[core] ${entry.module} offers the public component ${entry.component}, but no such component exists`)
          continue
        }
        const pascalName = entry.alias.split('-').map(p => p[0]!.toUpperCase() + p.slice(1)).join('')
        components.push({ ...found, pascalName, kebabName: entry.alias, global: true })
      }
    },
  },
  // Icons are bundled, so nothing is fetched from Iconify at run time.
  icon: { clientBundle: { scan: true }, serverBundle: 'local' },
})
