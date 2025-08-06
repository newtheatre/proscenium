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

  vite: {
    resolve: {
      alias: {
        '.prisma/client/index-browser': './node_modules/.prisma/client/index-browser.js',
      },
    },
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  linkChecker: {
    enabled: true,
  },

  ogImage: {
    enabled: false,
  },

  robots: {
    enabled: true,
    blockNonSeoBots: true,
  },

  schemaOrg: {
    enabled: true,
    identity: {
      type: 'Organization',
      name: 'New Theatre',
      url: 'https://newtheatre.org.uk',
      description: 'We are the only entirely student-run theatre in England. Producing over thirty shows a year, they range from ‘A Midsummer Night’s Dream’ to contemporaries plays, as well as a host of original student written pieces.',
    },
  },

  seo: {
    // redirectToCanonicalSiteUrl: true,
    automaticDefaults: true,
  },

  sitemap: {
    enabled: true,
    autoLastmod: true,
  },
})
