// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxtjs/seo',
    '@prisma/nuxt',
  ],

  devtools: { enabled: true },

  content: {
    experimental: { sqliteConnector: 'native' },
    database: {
      type: 'd1',
      bindingName: 'CF_BINDING_NAME',
    },
  },
  compatibilityDate: '2025-07-15',

  nitro: {
    cloudflare: {
      wrangler: {
        name: 'proscenium',
        routes: [
          {
            pattern: 'proscenium.newtheatre.org.uk',
            custom_domain: true,
          },
        ],
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'proscenium',
            database_id: '01a75263-87a9-452a-a4a0-b3b9db71dfe5',
          },
        ],
        observability: {
          logs: {
            enabled: true,
          },
        },
      },
    },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },
})
