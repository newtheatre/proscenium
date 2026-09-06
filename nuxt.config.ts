// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({

  modules: [
    '@nuxt/ui',
    '@nuxt/content',
    '@nuxt/image',
    '@nuxtjs/seo',
    '@nuxthub/core',
    'nuxt-authorization',
    'nuxt-auth-utils',
    '@vueuse/nuxt',
    // Advisory in the dev server and absent from a build, so the end-to-end harness drops them:
    // nineteen suites each pay their setup, and none of them reads the advice (0022).
    ...process.env.E2E_BASE_URL ? [] : ['@nuxt/a11y', '@nuxt/eslint', '@nuxt/hints'],
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

  // Off under the end-to-end harness: nineteen suites each boot a dev server, and DevTools is
  // build time nobody in that run will ever open.
  devtools: { enabled: !process.env.E2E_BASE_URL },

  css: ['~/assets/css/theme.css'],

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
    // Base64 AES-256 key sealing access_profiles.encrypted_payload (D-127, 0050). A worker
    // secret, not a Secrets Store one: nothing outside this app ever reads this column.
    accessProfileEncryptionKey: '',
    public: {
      // Every emailed link is built from this. NUXT_PUBLIC_BASE_URL overrides it, and development
      // points at the local port so a verification link in .data/mail is one that works.
      baseURL: process.env.NUXT_PUBLIC_BASE_URL
        ?? (process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.NUXT_PORT ?? 3000}` : 'https://newtheatre.org.uk'),
    },
  },

  // The developer tools do not exist in a build (K-124). A guard inside a file would still ship
  // the file; this keeps them out of the bundle entirely.
  ignore: process.env.NODE_ENV === 'production'
    ? ['app/pages/dev.vue', 'server/api/dev/**', 'server/utils/dev.ts']
    : [],

  experimental: {
    // A deploy rotates every asset hash, so an open tab asks for chunks that no longer exist.
    emitRouteChunkError: 'automatic-immediate',
  },

  compatibilityDate: '2026-08-26',

  nitro: {
    preset: 'cloudflare_module',

    // Nuxt's own `ignore` covers the app; Nitro scans server/ separately, so the developer
    // routes have to be excluded here too (K-124). A test on the built output proves it.
    ignore: process.env.NODE_ENV === 'production' ? ['api/dev/**'] : [],

    experimental: {
      tasks: true,
      wasm: true,
    },

    // Mirrored one-for-one by the cron triggers below; the two lists must not drift, and every
    // name here has a handler under server/tasks (docs/architecture.md, Scheduled tasks).
    scheduledTasks: {
      '*/10 * * * *': ['holds:release', 'health:watch'],
      '0 6 * * *': ['training:expiry-sweep'],
      '0 7 * * *': ['shifts:escalate'],
      '0 8 * * *': ['rooms:sweep'],
      '0 9 * * *': ['sessions:sweep'],
      '0 10 * * *': ['shifts:remind'],
      '0 17 * * *': ['rooms:remind'],
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
          crons: ['*/10 * * * *', '0 4 * * *', '0 5 * * 1', '0 6 * * *', '0 7 * * *', '0 8 * * *', '0 9 * * *', '0 10 * * *', '0 17 * * *', '12 0 * * *', '0 4 1 * *'],
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
    // The end-to-end suite points this at a throwaway directory so a run cannot depend on, or
    // disturb, whatever is in a developer's local database.
    dir: process.env.NUXT_HUB_DIR ?? '.data',
    db: 'sqlite',
    kv: false,
    cache: false,
    blob: true,
  },

  // Adds the WebAuthn ceremony handlers and useWebAuthn, which do not exist without it (A-105).
  // It also refuses to build if @simplewebauthn/* are missing, so the pair are dependencies.
  auth: {
    webAuthn: true,
  },

  eslint: {
    config: {
      stylistic: true,
    },
  },

  image: { provider: 'none' },

  // @nuxtjs/seo pulls in og-image, whose renderer needs a WASM dependency the worker bundle
  // cannot externalise. Nothing uses OG images yet; enabling it is a deliberate Phase 2 act.
  ogImage: { enabled: false },
})
