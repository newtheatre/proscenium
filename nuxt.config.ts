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
      // The estate cookie is scoped to the parent domain so every
      // *.newtheatre.org.uk app reads the same session. Production only —
      // localhost has no subdomains.
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
      // Cache KV namespace (binding defaults to 'CACHE')
      // cache: {
      //   driver: 'cloudflare-kv-binding',
      //   namespaceId: 'c6d3be0190414e1ab170a0788ec51fb6',
      // },
      // R2 bucket (binding defaults to 'BLOB')
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
    // Estate SSO (stage-door docs/session-contract.md): this app READS the
    // nnt-session cookie sealed by auth.newtheatre.org.uk and never writes
    // it (dev-only exception: /dev-login). NUXT_SESSION_PASSWORD is the
    // shared estate seal secret.
    session: {
      name: 'nnt-session',
      password: '',
      maxAge: 60 * 60 * 24 * 30,
    },
    resendApiKey: '',
    resendFromEmail: '',
    // Signs guest booking-access tokens. Falls back to the session password when
    // unset; set NUXT_BOOKING_TOKEN_SECRET to rotate booking links on their own,
    // which invalidates every outstanding one. NOTE: post-SSO the session
    // password is estate-wide — set the dedicated secret so booking links
    // don't die with estate-wide seal rotations.
    bookingTokenSecret: '',
    // Service token for server-to-server calls to the auth service
    // (AUTH_SERVICE_TOKEN worker secret) — guest checkout shadow accounts.
    authServiceToken: '',
    public: {
      authBaseURL: 'https://auth.newtheatre.org.uk',
      baseURL: 'https://newtheatre.org.uk',
    },
  },
  compatibilityDate: '2025-07-15',

  nitro: {
    preset: 'cloudflare_module',
    experimental: {
      tasks: true,
      wasm: true,
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
            // Set here rather than left to NuxtHub, whose default is
            // `.output/server/db/migrations/` — wrong twice over, and silently.
            //
            // Wrangler resolves this **relative to the config file**, and the
            // generated config lives at `.output/server/wrangler.json`, so that
            // default expands to `.output/server/.output/server/db/migrations`.
            // Point it at the project root instead and it lands on a directory
            // that holds only a `sqlite/` subdirectory, no `.sql` files — at
            // which point wrangler reports "✅ No migrations to apply!" and
            // exits 0. A false success on the one command whose whole job is
            // telling you whether production is up to date.
            //
            // NuxtHub sets it with `||=` (module.mjs), so this wins. Nothing
            // else reads it: the dev-time migrator resolves its own paths, so
            // this only affects the wrangler CLI.
            migrations_dir: 'db/migrations/sqlite',
          },
        ],
        // Estate-wide secrets live in the account Secrets Store so a rotation
        // is one write rather than four worker secrets updated in lockstep
        // (docs/08-operations.md#secrets). server/plugins/secrets-store.ts
        // turns the binding into runtimeConfig.session.password — read its
        // header before adding another entry here, the binding name matters.
        //
        // Cast: `secrets_store_secrets` is valid wrangler config but missing
        // from the wrangler types Nitro 2.13 bundles. Drop it once Nitro
        // catches up.
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
      },
    },
    routeRules: {
      '/mailing-list/': { redirect: 'https://newtheatre.us3.list-manage.com/subscribe?u=ce5311ce46fe45638f90f4022&id=97e4899eb8' },

      // Baseline security headers on every response.
      '/**': {
        headers: {
          // Booking references are bearer secrets and still appear in some URLs
          // (?ref=), so keep them out of the Referer sent to other origins.
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          // No subdomain rules and no preload: this header is served from the
          // ticketing host, and the society's other subdomains are not ours to
          // commit to HTTPS from here.
          'Strict-Transport-Security': 'max-age=15552000',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
          // Deliberately no script-src. Nuxt emits inline hydration scripts, so
          // a script policy needs per-request nonces rather than a static rule —
          // worth doing, but as its own change. These three directives are the
          // part that can be set statically without breaking the app.
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
