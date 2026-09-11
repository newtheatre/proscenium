// https://nuxt.com/docs/api/configuration/nuxt-config
import { OLD_SITE_REDIRECTS } from './shared/utils/redirects'
import { PRODUCTION_SITE_URL, ROBOTS_DISALLOW, SITE_ADDRESS, SITE_NAME } from './shared/utils/seo'

// One literal for the canonical address and for emailed links. Nuxt maps NUXT_PUBLIC_SITE_URL
// and NUXT_PUBLIC_BASE_URL onto the two keys at request time, so nothing is read here (K-125).
const SITE_URL = PRODUCTION_SITE_URL

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
        // Relative: whichever host serves the page transforms its own files, so no host ever
        // depends on another holding the same pictures (K-126).
        baseURL: '/',
      },
    },
  },

  // Off under the end-to-end harness: nineteen suites each boot a dev server, and DevTools is
  // build time nobody in that run will ever open.
  devtools: { enabled: !process.env.E2E_BASE_URL },

  css: ['~/assets/css/theme.css'],

  site: {
    url: SITE_URL,
    name: SITE_NAME,
    defaultLocale: 'en-GB',
  },

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
    // Base64 HMAC key signing a reservation's QR token (D-108). A worker secret: nothing
    // outside this app ever verifies one.
    qrTokenSecret: '',
    // HMAC key material for the backstage board's join code (E-120). Never stored, never
    // logged, and read by nothing outside this app.
    backstageBoardSecret: '',
    // Base64 HMAC key signing a waiting-list entry's claim and removal token (D-113). A worker
    // secret: nothing outside this app ever verifies one.
    waitingListTokenSecret: '',
    public: {
      // Every emailed link is built from this. NUXT_PUBLIC_BASE_URL overrides it, and development
      // points at the local port so a verification link in .data/mail is one that works.
      baseURL: process.env.NODE_ENV === 'development' ? `http://localhost:${process.env.NUXT_PORT ?? 3000}` : SITE_URL,
      // Declared here so a worker's NUXT_PUBLIC_SITE_URL reaches site config at request time.
      site: {
        url: SITE_URL,
      },
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
      '*/10 * * * *': ['holds:release', 'health:watch', 'notifications:retry', 'notifications:digest', 'waiting-list:sweep'],
      '0 6 * * *': ['training:expiry-sweep'],
      '0 7 * * *': ['shifts:escalate'],
      '0 8 * * *': ['rooms:sweep'],
      '0 9 * * *': ['sessions:sweep'],
      '0 10 * * *': ['shifts:remind'],
      '0 11 * * *': ['passes:expire-requests'],
      '0 17 * * *': ['rooms:remind'],
      '12 0 * * *': ['nights:close'],
      '0 4 * * *': ['daily:sweeps', 'waiting-list:purge'],
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
          crons: ['*/10 * * * *', '0 4 * * *', '0 5 * * 1', '0 6 * * *', '0 7 * * *', '0 8 * * *', '0 9 * * *', '0 10 * * *', '0 11 * * *', '0 17 * * *', '12 0 * * *', '0 4 1 * *'],
        },
      },
    },

    routeRules: {
      // Every old-site address answers 301 to where it lives now (K-125, docs/operations.md).
      ...Object.fromEntries(Object.entries(OLD_SITE_REDIRECTS)
        .map(([from, to]) => [from, { redirect: { to, statusCode: 301 } }])),

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

    rollupConfig: {
      output: {
        intro: 'import "reflect-metadata";',
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

  // Off: og-image's renderer needs a WASM dependency the worker bundle cannot externalise, so
  // every page names a static file instead (K-125, docs/known-issues.md).
  ogImage: { enabled: false },

  robots: {
    disallow: ROBOTS_DISALLOW,
  },

  // The organisation node every page carries and a show's events point at as organiser (K-125).
  schemaOrg: {
    identity: {
      '@type': ['Organization', 'PerformingArtsTheater'],
      'name': SITE_NAME,
      'url': SITE_URL,
      'logo': '/images/logos/anniversary-grey.png',
      'address': SITE_ADDRESS,
    },
  },

  // Only the server source lists URLs: the page scan would offer every console and member
  // route, and the content scan the signed-in documentation (K-125).
  sitemap: {
    excludeAppSources: true,
    sources: ['/api/__sitemap__/urls'],
    credits: false,
  },
})
