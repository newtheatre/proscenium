// Upstream-owned. The theatre's `site/` folder is the Nuxt project's source (srcDir and serverDir),
// so anything there outranks every layer; upstream's code lives in `layers/`, which Nuxt registers
// on its own, and a theatre's own modules in `site/layers/x-*`.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
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

  $production: { nitro: { entry: r('./layers/core/server/entry.ts') } },
  devtools: { enabled: false },
  content: { database: { type: 'd1', bindingName: 'DB' }, experimental: { sqliteConnector: 'native' } },
  // Fonts and icons are bundled: nothing loads from a third party (UI-24, Part B).
  ui: { fonts: false },
  dir: { public: 'site/public' },
  srcDir: 'site/app',
  serverDir: 'site/server',
  compatibilityDate: COMPATIBILITY_DATE,

  nitro: {
    preset: 'cloudflare_module',
    experimental: { asyncContext: true },
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

  hooks: {
    // The prerenderer (Nuxt Content's pages) builds its own Nitro from this config; it must keep
    // Nitro's entry rather than the Worker's.
    'nitro:init'(nitro) {
      nitro.hooks.hook('prerender:config', (config) => {
        delete config.entry
      })
    },
    // `nuxt dev` emulates the bindings with wrangler's platform proxy, which needs a config file.
    // Local state lives in .wrangler/state, shared with `bun run preview`. Migrations apply on the
    // first request; jobs and the scheduler run in-process (layers/core/server/plugins/01.kit.ts).
    'nitro:config'(config) {
      if (!config.dev) return
      const path = r('./.nuxt/wrangler.dev.json')
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify({
        name,
        compatibility_date: COMPATIBILITY_DATE,
        compatibility_flags: ['nodejs_compat'],
        vars: { PROSCENIUM_AUTO_MIGRATE: '1' },
        d1_databases: [{ binding: 'DB', database_name: `${name}-db`, database_id: 'local' }],
        r2_buckets: [{ binding: 'FILES', bucket_name: `${name}-files` }],
        kv_namespaces: [{ binding: 'CACHE', id: 'local' }],
        send_email: [{ name: 'EMAIL' }],
        queues: { producers: [{ binding: 'JOBS_PROMPT', queue: queue.prompt }, { binding: 'JOBS_BULK', queue: queue.bulk }, { binding: 'EMAIL_EVENTS', queue: queue.emailEvents }] },
      }, null, 2))
      config.cloudflare = { ...config.cloudflare, dev: { ...config.cloudflare?.dev, configPath: path, persistDir: r('./.wrangler/state') } }
    },
  },
  eslint: { config: { stylistic: true } },
  // Icons named in TypeScript (a module's menu entries, groups and cards in module.ts) are scanned too:
  // with no fallback to the Iconify API, an icon left out of the bundle would not show at all.
  icon: { fallbackToApi: false, serverBundle: 'local', clientBundle: { scan: { globInclude: ['**/*.{vue,ts,jsx,tsx,md,mdc,mdx,yml,yaml}'] } } },
})
