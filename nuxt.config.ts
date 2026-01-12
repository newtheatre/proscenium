// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/a11y',
    '@nuxt/content',
    '@nuxt/eslint',
    '@nuxt/hints',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxtjs/seo',
    '@nuxthub/core',
    'nuxt-studio',
  ],

  $production: {
    image: {
      provider: 'cloudflare',
      cloudflare: {
        baseURL: 'https://newtheatre.org.uk/',
      },
    },
  },
  devtools: { enabled: true },

  content: {
    database: {
      type: 'd1',
      bindingName: 'DB',
    },
  },
  compatibilityDate: '2025-07-15',

  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
    },
  },

  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'd1', // FIXME: https://github.com/nuxt-hub/core/pull/775
      connection: { databaseId: 'c4200074-3ce8-411d-b428-811277057e6b' },
    },
    // KV namespace (binding defaults to 'KV')
    kv: false,
    // Cache KV namespace (binding defaults to 'CACHE')
    cache: {
      driver: 'cloudflare-kv-binding',
      namespaceId: 'c6d3be0190414e1ab170a0788ec51fb6',
    },
    // R2 bucket (binding defaults to 'BLOB')
    blob: {
      driver: 'cloudflare-r2',
      bucketName: '<bucket-name>', // TODO: replace once we have a bucket
      binding: 'BLOB',
    },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },
})
