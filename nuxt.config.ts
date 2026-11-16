// Upstream-owned. The theatre's site/ is the project itself, so it outranks every layer.
import site from './site.config'
import { readdirSync, existsSync } from 'node:fs'
const theatreLayers = existsSync('./site/layers') ? readdirSync('./site/layers', { withFileTypes: true }).filter(d => d.isDirectory()).map(d => `./site/layers/${d.name}`) : []
export default defineNuxtConfig({
  extends: theatreLayers,
  compatibilityDate: '2026-11-10',
  srcDir: 'site/app',
  serverDir: 'site/server',
  dir: { public: '../public' },
  modules: ['@nuxt/content'],
  runtimeConfig: { public: { siteName: site.name } },
  content: { database: { type: 'd1', bindingName: 'DB' }, experimental: { sqliteConnector: 'native' } },
  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        compatibility_date: '2026-11-01',
        d1_databases: [{ binding: 'DB' }],
        r2_buckets: [{ binding: 'FILES' }],
        kv_namespaces: [{ binding: 'CACHE' }],
        queues: { producers: [{ binding: 'JOBS', queue: `proscenium-jobs` }], consumers: [{ queue: `proscenium-jobs` }] },
      },
    },
  },
})
