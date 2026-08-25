// https://nuxt.com/docs/api/configuration/nuxt-config

// Signup belongs to the Alumni Network's own site (newtheatre/lumina), not here.
const ALUMNI_SIGNUP_URL = 'https://alumni.newtheatre.org.uk/register'

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
      // Production only: localhost has no subdomains, so a domain'd cookie breaks
      // dev.
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
        driver: 'd1', // FIXME: https://github.com/nuxt-hub/core/pull/775
        connection: { databaseId: '01a75263-87a9-452a-a4a0-b3b9db71dfe5' },
      },
      // KV namespace (binding defaults to 'KV')
      kv: false,
      blob: {
        driver: 'cloudflare-r2',
        bucketName: 'proscenium-blob',
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
    // This app READS the nnt-session cookie and never writes it (dev-only
    // exception: /dev-login). Shape: stage-door docs/session-contract.md
    session: {
      name: 'nnt-session',
      password: '',
      maxAge: 60 * 60 * 24 * 30,
    },
    resendApiKey: '',
    resendFromEmail: '',
    // Signs guest booking-access tokens. Set NUXT_BOOKING_TOKEN_SECRET in
    // production so links do not die with an estate seal rotation (ADR-0009).
    bookingTokenSecret: '',
    // Derives the nightly backstage code. Nothing is stored, so rotating this
    // changes tonight's code and nothing else (ADR-0020).
    backstageCodeSecret: '',
    // Worker secret NUXT_AUTH_SERVICE_TOKEN. The NUXT_ prefix is load-bearing:
    // a secret named AUTH_SERVICE_TOKEN is silently ignored.
    authServiceToken: '',
    // Reads rehearsal's eligibility rules (ADR-0026). Same prefix rule.
    trainingApiToken: '',
    trainingApiBaseURL: 'https://training.newtheatre.org.uk',
    // Comma-separated standing recipients of the end-of-night report. The
    // closing duty manager is added at send time (docs/12 §4.2).
    nightReportRecipients: '',
    public: {
      authBaseURL: 'https://auth.newtheatre.org.uk',
      baseURL: 'https://newtheatre.org.uk',
    },
  },

  experimental: {
    // A deploy rotates every asset hash, so an open tab asks for chunks that
    // no longer exist. 'automatic' only recovers on navigation (docs/09).
    emitRouteChunkError: 'automatic-immediate',
  },
  compatibilityDate: '2025-07-15',

  nitro: {
    preset: 'cloudflare_module',
    experimental: {
      tasks: true,
      wasm: true,
    },
    scheduledTasks: {
      // Backstage free text is chatter, not record: 30 days, then gone
      // (docs/11 §5.5). Runs off the wrangler cron trigger below.
      '0 4 * * *': ['backstage:sweep', 'access:sweep', 'training:purge'],
      // Comp requests expire in ten minutes; this only tidies the row up.
      '*/15 * * * *': ['comps:sweep'],
      // Late morning, so a reminder for tomorrow lands in waking hours.
      '0 10 * * *': ['shifts:remind'],
      // 12:00 UTC: noon in winter, an hour after it in summer. Never early,
      // which is what matters when the deadline is the duty manager's.
      '0 12 * * *': ['reports:auto-close', 'reports:email-unsent'],
    },
    rollupConfig: {
      plugins: [
        {
          name: 'stub-react-email',
          resolveId(id: string) {
            if (id === '@react-email/render') return id
          },
          load(id: string) {
            if (id === '@react-email/render') return 'export {}'
          },
        },
      ],
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
            database_id: '01a75263-87a9-452a-a4a0-b3b9db71dfe5',
            // NuxtHub's default resolves to a directory with no `.sql` files, so wrangler
            // reports "No migrations to apply!" and exits 0. Set it explicitly.
            migrations_dir: 'db/migrations/sqlite',
          },
        ],
        // Estate secrets come from the Secrets Store (stage-door ADR-0016); the
        // binding name matters: read server/plugins/0.secrets-store.ts first.
        ...({
          secrets_store_secrets: [
            {
              binding: 'SESSION_PASSWORD',
              store_id: 'fdfe08b6b01f498fbddbc08c2891cadb',
              secret_name: 'NUXT_SESSION_PASSWORD',
            },
          ],
        } as object),
        observability: {
          logs: {
            enabled: true,
          },
        },
        triggers: {
          crons: ['*/15 * * * *', '0 4 * * *', '0 10 * * *', '0 12 * * *'],
        },
      },
    },
    routeRules: {
      '/mailing-list/': { redirect: 'https://newtheatre.us3.list-manage.com/subscribe?u=ce5311ce46fe45638f90f4022&id=97e4899eb8' },

      // The history site and the old Jekyll site both send alumni to these URLs,
      // and neither is ours to edit; keep all four alive.
      '/alumni/registration': { redirect: ALUMNI_SIGNUP_URL },
      '/alumni/registration/': { redirect: ALUMNI_SIGNUP_URL },
      '/alumni/register': { redirect: ALUMNI_SIGNUP_URL },
      '/alumni/register/': { redirect: ALUMNI_SIGNUP_URL },

      // The door scanner reads a ticket QR, so it is the one route allowed the
      // camera. Same-origin only; every other header matches the baseline below.
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
          // Guest booking links carry a signed token in `?t=` until the page swaps it
          // for a cookie, so keep the query string out of the Referer (ADR-0009).
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          // No subdomain rules and no preload: this is served from the ticketing host,
          // and the society's other subdomains are not ours to commit.
          'Strict-Transport-Security': 'max-age=15552000',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
          // Deliberately no script-src: Nuxt emits inline hydration scripts, so a
          // script policy needs per-request nonces rather than a static rule.
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
