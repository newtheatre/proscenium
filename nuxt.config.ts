// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/a11y',
    '@nuxt/ui',
    '@nuxt/content',
    '@nuxt/eslint',
    '@nuxt/hints',
    '@nuxt/image',
    '@nuxtjs/seo',
    '@nuxthub/core',
    'nuxt-authorization',
    'nuxt-auth-utils',
  ],

  $production: {
    hub: {
      db: {
        dialect: 'sqlite',
        driver: 'd1', // FIXME: https://github.com/nuxt-hub/core/pull/775
        connection: { databaseId: 'c4200074-3ce8-411d-b428-811277057e6b' },
      },
      // KV namespace (binding defaults to 'KV')
      kv: false,
      // Cache KV namespace (binding defaults to 'CACHE')
      // cache: {
      //   driver: 'cloudflare-kv-binding',
      //   namespaceId: 'c6d3be0190414e1ab170a0788ec51fb6',
      // },
      // R2 bucket (binding defaults to 'BLOB')
      // FIXME: Currently using S3 driver because we have no R2 bucket on the NNT account,
      // but should switch to Cloudflare R2 once we have a bucket set up
      blob: true,
      // blob: {
      //   driver: 'cloudflare-r2',
      //   bucketName: '<bucket-name>', // TODO: replace once we have a bucket
      //   binding: 'BLOB',
      // },
    },

    image: {
      provider: 'cloudflare',
      cloudflare: {
        baseURL: 'https://newtheatre.org.uk/',
      },
    },
  },
  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  content: {
    database: {
      type: 'd1',
      bindingName: 'DB',
    },
  },

  runtimeConfig: {
    resendApiKey: '',
    resendFromEmail: '',
  },
  compatibilityDate: '2025-07-15',

  nitro: {
    // preset: 'cloudflare_module', // TODO: enable when deploying
    experimental: {
      tasks: true,
      wasm: true,
    },
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        name: 'proscenium',
        routes: [
          {
            pattern: 'proscenium.newtheatre.org.uk',
            custom_domain: true,
          },
          {
            pattern: 'newtheatre.org.uk',
            custom_domain: true,
          },
        ],
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'proscenium',
            database_id: 'c4200074-3ce8-411d-b428-811277057e6b',
          },
        ],
        observability: {
          logs: {
            enabled: true,
          },
        },
      },
    },
    routeRules: {
      '/mailing-list/': { redirect: 'https://newtheatre.us3.list-manage.com/subscribe?u=ce5311ce46fe45638f90f4022&id=97e4899eb8' },
    },
  },

  hub: {
    db: 'sqlite',
    kv: false,
    cache: false,
    blob: true,
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  icon: {
    customCollections: [
      {
        prefix: 'icon',
        dir: './app/assets/icons',
      },
    ],
  },

  image: { provider: 'none' },
})
