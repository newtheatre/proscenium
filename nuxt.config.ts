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
    runtimeConfig: {
      // Production only: localhost has no subdomains, so a domain'd cookie breaks dev.
      session: {
        name: 'nnt-session',
        password: '',
        maxAge: 60 * 60 * 24 * 30,
        cookie: { domain: '.newtheatre.org.uk', sameSite: 'lax', secure: true },
      },
    },

    hub: {
      db: {
        dialect: 'sqlite',
        driver: 'd1',
        connection: { databaseId: '02c35a27-b6dc-47b0-8d9b-7a526324aca1' },
      },
      kv: false,
      blob: {
        driver: 'cloudflare-r2',
        bucketName: 'unified-blob',
        binding: 'BLOB',
      },
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
    // This application writes the session; it is the estate's identity provider (0007, 0008).
    session: {
      name: 'nnt-session',
      password: '',
      maxAge: 60 * 60 * 24 * 30,
    },
    // Workspace-only Google sign-in (0008). The NUXT_ prefix is load-bearing: a worker secret
    // named GOOGLE_CLIENT_SECRET is silently ignored.
    googleClientId: '',
    googleClientSecret: '',
    public: {
      baseURL: 'https://newtheatre.org.uk',
    },
  },

  experimental: {
    // A deploy rotates every asset hash, so an open tab asks for chunks that no longer exist.
    emitRouteChunkError: 'automatic-immediate',
  },

  compatibilityDate: '2026-08-26',

  nitro: {
    preset: 'cloudflare_module',

    experimental: {
      tasks: true,
      wasm: true,
    },

    // Mirrored one-for-one by the cron triggers below; the two lists must not drift
    // (docs/architecture.md, Scheduled tasks).
    scheduledTasks: {
      '*/10 * * * *': ['holds:release'],
      '0 6 * * *': ['training:expiry-sweep'],
      '0 9 * * *': ['sessions:sweep'],
      '0 10 * * *': ['shifts:remind'],
      '12 0 * * *': ['nights:close'],
      '0 4 * * *': ['daily:sweeps'],
      '0 5 * * 1': ['backup'],
      '0 4 1 * *': ['retention:sweep'],
    },

    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        name: 'nnt-unified',
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'unified',
            database_id: '02c35a27-b6dc-47b0-8d9b-7a526324aca1',
            // NuxtHub's default resolves to a directory with no `.sql` files, so wrangler
            // reports "No migrations to apply!" and exits 0. Set it explicitly.
            migrations_dir: 'server/db/migrations/sqlite',
          },
        ],
        observability: {
          logs: {
            enabled: true,
          },
        },
        triggers: {
          crons: ['*/10 * * * *', '0 4 * * *', '0 5 * * 1', '0 6 * * *', '0 9 * * *', '0 10 * * *', '12 0 * * *', '0 4 1 * *'],
        },
      },
    },

    routeRules: {
      // The door scanner reads a ticket QR, so it is the one route allowed the camera.
      // Same-origin only; every other header matches the baseline below.
      '/foh/scan': {
        headers: {
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Strict-Transport-Security': 'max-age=15552000',
          'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
          'Content-Security-Policy': 'frame-ancestors \'none\'; object-src \'none\'; base-uri \'self\'',
        },
      },

      // Baseline security headers on every response.
      '/**': {
        headers: {
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          // No subdomain rules and no preload: the society's other subdomains are not ours
          // to commit until the old estate goes read-only.
          'Strict-Transport-Security': 'max-age=15552000',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
          // Deliberately no script-src: Nuxt emits inline hydration scripts, so a script
          // policy needs per-request nonces rather than a static rule.
          'Content-Security-Policy': 'frame-ancestors \'none\'; object-src \'none\'; base-uri \'self\'',
        },
      },
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

  image: { provider: 'none' },
})
