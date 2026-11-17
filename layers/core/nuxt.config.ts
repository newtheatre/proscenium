// The core layer: the kit, the generated registry, the Worker's background handlers and the
// interface's foundations (Nuxt UI v4 on Tailwind CSS v4, as in Mailflare).
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { kitAliases } from './aliases'
import { MODE_COOKIE_AGE, MODE_KEY } from './shared/appearance'

/** The layout of each shell that has one of its own, by the prefix of its addresses. */
const SHELL_LAYOUTS = { '/console': 'console', '/members': 'members', '/admin': 'admin', '/live': 'live' }

const root = fileURLToPath(new URL('../..', import.meta.url))
const publicComponentsFile = fileURLToPath(new URL('../../.generated/public-components.json', import.meta.url))
const generatedTypes = fileURLToPath(new URL('../../.generated/types/registry.d.ts', import.meta.url))

export default defineNuxtConfig({
  // Loads Cloudflare Turnstile for TurnstileCheck. The site key is public and set at run time with
  // NUXT_PUBLIC_TURNSTILE_SITE_KEY, beside CORE_TURNSTILE_SECRET_KEY; the kit verifies the token itself.
  modules: ['@nuxtjs/turnstile'],
  app: { head: { htmlAttrs: { lang: 'en-GB' } } },
  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],
  // The colour mode is kept in a cookie, so the server knows it before it renders (shared/appearance.ts).
  colorMode: { storage: 'cookie', storageKey: MODE_KEY, cookieAttrs: { path: '/', maxAge: MODE_COOKIE_AGE, sameSite: 'lax' } },
  runtimeConfig: { public: { turnstile: { siteKey: '' } } },
  alias: kitAliases(root),
  // Screens that moved to Site administration (R-33): old bookmarks still arrive.
  routeRules: {
    // The catch-all page of site settings is gone: each group has one page of its own (settings build brief).
    '/admin/settings': { redirect: { to: '/admin/theatre', statusCode: 301 } },
    '/console/system/settings': { redirect: { to: '/admin/theatre', statusCode: 301 } },
    '/console/system/email': { redirect: { to: '/admin/email', statusCode: 301 } },
    '/console/system/vocabularies': { redirect: { to: '/admin/vocabularies', statusCode: 301 } },
    '/console/system/vocabularies/**': { redirect: { to: '/admin/vocabularies/**', statusCode: 301 } },
    '/console/programme/venues': { redirect: { to: '/console/venues', statusCode: 301 } },
    '/console/programme/venues/**': { redirect: { to: '/console/venues/**', statusCode: 301 } },
    '/admin/venues': { redirect: { to: '/console/venues', statusCode: 301 } },
    '/admin/venues/**': { redirect: { to: '/console/venues/**', statusCode: 301 } },
    // Core's Programme and People settings are tabs of Core's page in Admin, and the console's cog opens them.
    '/console/programme/settings': { redirect: { to: '/console?settings=core', statusCode: 301 } },
    '/console/people/settings': { redirect: { to: '/console?settings=core', statusCode: 301 } },
  },
  experimental: {
    // A link's page is fetched when a person points at or focuses it, not when the link scrolls
    // into view: a menu is a column of links, and most are never followed.
    defaults: { nuxtLink: { prefetchOn: { interaction: true, visibility: false } } },
  },
  nitro: {
    // Nitro drops imports of packages it thinks have no side effects; this polyfill is nothing else.
    moduleSideEffects: ['reflect-metadata'],
    typescript: { tsConfig: { include: [generatedTypes], compilerOptions: { types: ['@cloudflare/workers-types'] } } },
  },
  // The app's typed $fetch reads the server routes, and with them the kit's Cloudflare types.
  typescript: { tsConfig: { compilerOptions: { types: ['@cloudflare/workers-types'] } } },
  hooks: {
    // A page under a shell's prefix gets that shell's layout from its address, so no page has to
    // name it. A page that names a layout itself keeps it.
    'pages:extend'(pages) {
      const visit = (list: typeof pages) => {
        for (const page of list) {
          const layout = Object.entries(SHELL_LAYOUTS).find(([prefix]) => page.path === prefix || page.path.startsWith(`${prefix}/`))?.[1]
          if (layout) page.meta = { layout, ...page.meta }
          if (page.children?.length) visit(page.children)
        }
      }
      visit(pages)
    },
    // The public pages do not ask the browser to fetch the signed-in shells' pages in advance.
    'build:manifest'(manifest) {
      for (const chunk of Object.values(manifest)) {
        if (chunk.src && /\/app\/pages\/(console|members|account)\//.test(chunk.src)) chunk.prefetch = false
      }
    },
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
