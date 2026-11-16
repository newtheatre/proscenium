// The core layer: the kit, the generated registry and the Worker's background handlers.
import { fileURLToPath } from 'node:url'
import { kitAliases } from './aliases'

const root = fileURLToPath(new URL('../..', import.meta.url))
const generatedTypes = fileURLToPath(new URL('../../.generated/types/registry.d.ts', import.meta.url))

export default defineNuxtConfig({
  app: { head: { htmlAttrs: { lang: 'en-GB' } } },
  alias: kitAliases(root),
  nitro: {
    typescript: { tsConfig: { include: [generatedTypes], compilerOptions: { types: ['@cloudflare/workers-types'] } } },
  },
  // The app's typed $fetch reads the server routes, and with them the kit's Cloudflare types.
  typescript: { tsConfig: { compilerOptions: { types: ['@cloudflare/workers-types'] } } },
})
