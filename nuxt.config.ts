// Upstream-owned. The theatre's `site/` folder is the Nuxt project's source (srcDir and serverDir),
// so anything there outranks every layer; upstream's code lives in `layers/`, which Nuxt registers
// on its own, and a theatre's own modules in `site/layers/x-*`.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/** The theatre's Worker name, from its wrangler.jsonc. Queue names follow from it. */
function workerName(): string {
  const text = readFileSync(r('./wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  return (JSON.parse(text) as { name: string }).name
}
const name = workerName()
// The two job lanes, and the queue Cloudflare Email Sending reports outcomes to (EMAIL_EVENTS).
const queue = { prompt: `${name}-prompt`, bulk: `${name}-bulk`, emailEvents: `${name}-email-events` }
const theatreLayers = existsSync(r('./site/layers'))
  ? readdirSync(r('./site/layers'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => `./site/layers/${d.name}`)
  : []
// The browser tests' build adds a module of fixture screens (tests/fixtures/gallery). No other build does.
const gallery = process.env.PROSCENIUM_GALLERY === '1' ? ['./tests/fixtures/gallery/gallery'] : []
const COMPATIBILITY_DATE = '2026-11-01'

export default defineNuxtConfig({
  // The gallery fixture module is added only to the browser tests' build.
  extends: [...theatreLayers, ...gallery],
  // Nuxt UI before Nuxt Content, so content pages use Nuxt UI's prose components.
  modules: ['@nuxt/ui', '@nuxt/content', '@nuxt/eslint'],

  devtools: { enabled: false },
  content: { database: { type: 'd1', bindingName: 'DB' }, experimental: { sqliteConnector: 'native' } },
  // Fonts and icons are bundled: nothing loads from a third party (UI-24, Part B).
  ui: { fonts: false, eslint: true },
  dir: { public: 'site/public' },
  srcDir: 'site/app',
  serverDir: 'site/server',
  compatibilityDate: COMPATIBILITY_DATE,
  nitroLegacy: false,

  hooks: {
    // The prerenderer (Nuxt Content's pages) builds its own Nitro from this config and runs it in Node,
    // so it must not get the Worker's server entry, which imports `cloudflare:workers`.
    'nitro:init'(nitro) {
      nitro.hooks.hook('prerender:config', (config) => {
        config.serverEntry = false
      })
    },
  },

  // `nuxt dev` runs the Worker's bindings in Miniflare, with local state in .wrangler/state. Migrations apply
  // on the first request; jobs and the scheduler run in-process (layers/core/server/plugins/01.kit.ts).
  $development: { nitro: { cloudflare: { wrangler: { vars: { PROSCENIUM_AUTO_MIGRATE: '1' } } } } },

  nitro: {
    preset: 'cloudflare_module',
    // The Worker's Durable Objects and its socket route (layers/core/server/entry.ts).
    serverEntry: { handler: r('./layers/core/server/entry.ts'), format: 'web' },
    experimental: { asyncContext: true },
    // Nuxt Content's Cloudflare handler serves each collection's dump from the ASSETS binding, which
    // the prerenderer does not have. The Worker answers these routes itself, so they are not prerendered.
    prerender: { ignore: [/^\/__nuxt_content\/[^/]+\/sql_dump\.txt$/] },
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        compatibility_date: COMPATIBILITY_DATE,
        observability: { enabled: true },
        d1_databases: [{ binding: 'DB' }],
        r2_buckets: [{ binding: 'FILES' }],
        kv_namespaces: [{ binding: 'CACHE' }],
        // Cloudflare Email Sending. Sends only from a domain onboarded in the dashboard.
        send_email: [{ name: 'EMAIL' }],
        triggers: { crons: ['* * * * *'] },
        // The shared rate-limit counts (F-36). The class is exported from layers/core/server/entry.ts.
        // The realtime rooms (#kit/realtime); RealtimeHub is exported from the same entry.
        durable_objects: { bindings: [{ name: 'RATE_LIMITS', class_name: 'RateLimitCounter' }, { name: 'REALTIME', class_name: 'RealtimeHub' }] },
        migrations: [{ tag: 'core-rate-limits', new_sqlite_classes: ['RateLimitCounter'] }, { tag: 'core-realtime', new_sqlite_classes: ['RealtimeHub'] }],
        queues: {
          producers: [
            { binding: 'JOBS_PROMPT', queue: queue.prompt },
            { binding: 'JOBS_BULK', queue: queue.bulk },
            // Written to by the sending domain's event subscription, a setup step in the dashboard.
            { binding: 'EMAIL_EVENTS', queue: queue.emailEvents },
          ],
          consumers: [
            // not-policy: queue delivery tuning; job retries and back-off are core settings.
            { queue: queue.prompt, max_batch_size: 10, max_batch_timeout: 1, max_retries: 3, dead_letter_queue: `${queue.prompt}-dead` },
            { queue: queue.bulk, max_batch_size: 2, max_batch_timeout: 5, max_retries: 3, dead_letter_queue: `${queue.bulk}-dead` },
            // An outcome can arrive before its send is recorded, so it is retried a few times, a few
            // seconds apart, then set aside in the dead-letter queue (layers/core/kit/email-events.ts).
            { queue: queue.emailEvents, max_batch_size: 10, max_batch_timeout: 5, max_retries: 5, dead_letter_queue: `${queue.emailEvents}-dead` },
          ],
        },
      },
    },
  },

  eslint: { config: { stylistic: true } },
  // Icons named in TypeScript (a module's menu entries, groups and cards in module.ts) are scanned too:
  // with no fallback to the Iconify API, an icon left out of the bundle would not show at all.
  icon: { fallbackToApi: false, serverBundle: 'local', clientBundle: { scan: { globInclude: ['**/*.{vue,ts,jsx,tsx,md,mdc,mdx,yml,yaml}'] } } },
})
