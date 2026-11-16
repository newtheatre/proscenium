// The core layer: the kit, the generated registry, the Worker's background handlers and the
// interface's foundations (Nuxt UI v4 on Tailwind CSS v4, as in Mailflare).
import { fileURLToPath } from 'node:url'
import { kitAliases } from './aliases'

const root = fileURLToPath(new URL('../..', import.meta.url))
const generatedTypes = fileURLToPath(new URL('../../.generated/types/registry.d.ts', import.meta.url))

export default defineNuxtConfig({
  app: { head: { htmlAttrs: { lang: 'en-GB' } } },
  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],
  // Turnstile's site key is public; set NUXT_PUBLIC_TURNSTILE_SITE_KEY beside CORE_TURNSTILE_SECRET_KEY.
  runtimeConfig: { public: { turnstileSiteKey: '' } },
  alias: kitAliases(root),
  nitro: {
    // Nitro drops imports of packages it thinks have no side effects; this polyfill is nothing else.
    moduleSideEffects: ['reflect-metadata'],
    typescript: { tsConfig: { include: [generatedTypes], compilerOptions: { types: ['@cloudflare/workers-types'] } } },
  },
  // The app's typed $fetch reads the server routes, and with them the kit's Cloudflare types.
  typescript: { tsConfig: { compilerOptions: { types: ['@cloudflare/workers-types'] } } },
  // Icons are bundled, so nothing is fetched from Iconify at run time.
  icon: { clientBundle: { scan: true }, serverBundle: 'local' },
})
