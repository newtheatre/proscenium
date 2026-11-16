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
const queue = { prompt: `${name}-prompt`, bulk: `${name}-bulk` }
const theatreLayers = existsSync(r('./site/layers'))
  ? readdirSync(r('./site/layers'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => `./site/layers/${d.name}`)
  : []
const COMPATIBILITY_DATE = '2026-11-01'

export default defineNuxtConfig({
  extends: theatreLayers,
  modules: ['@nuxt/content', '@nuxt/eslint'],

  $production: { nitro: { entry: r('./layers/core/server/entry.ts') } },
  devtools: { enabled: false },
  content: { database: { type: 'd1', bindingName: 'DB' }, experimental: { sqliteConnector: 'native' } },
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
        queues: {
          producers: [
            { binding: 'JOBS_PROMPT', queue: queue.prompt },
            { binding: 'JOBS_BULK', queue: queue.bulk },
          ],
          consumers: [
            // not-policy: queue delivery tuning; job retries and back-off are core settings.
            { queue: queue.prompt, max_batch_size: 10, max_batch_timeout: 1, max_retries: 3, dead_letter_queue: `${queue.prompt}-dead` },
            { queue: queue.bulk, max_batch_size: 2, max_batch_timeout: 5, max_retries: 3, dead_letter_queue: `${queue.bulk}-dead` },
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
    // first request; jobs and the scheduler run in-process (layers/core/server/plugins/kit.ts).
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
        queues: { producers: [{ binding: 'JOBS_PROMPT', queue: queue.prompt }, { binding: 'JOBS_BULK', queue: queue.bulk }] },
      }, null, 2))
      config.cloudflare = { ...config.cloudflare, dev: { ...config.cloudflare?.dev, configPath: path, persistDir: r('./.wrangler/state') } }
    },
  },
  eslint: { config: { stylistic: true } },
})
