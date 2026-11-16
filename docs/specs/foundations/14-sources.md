# Sources

## Where each claim about another system comes from

Every statement in this document about Proscenium, Mailflare, Flytower, Nuxt or Cloudflare rests on one of the sources below. Repository sources were read on 16 November 2026 at the state of each default branch that day. Where a claim comes from memory of a platform's behaviour and was not re-read, it says so.

## The three reference systems

| Claim | Source |
| --- | --- |
| Mailflare declares its bindings in `nuxt.config.ts` and has no Wrangler file, with resource identifiers written into that configuration | `matta-official/mailflare`: `nuxt.config.ts`, `CLAUDE.md` ("Bindings are declared in nuxt.config.ts under nitro.cloudflare.wrangler; there is no wrangler file in the repo") |
| Mailflare uses its own Worker entry because Nitro's queue and email hooks run too late to acknowledge or retry | Mailflare `CLAUDE.md`, "Worker entry"; `server/worker.ts` |
| Mailflare applies migrations with an in-app runner from first-run setup and an admin update card | Mailflare `CLAUDE.md`, "Migrations" |
| Mailflare generates route stubs into committed files marked as generated | Mailflare `CLAUDE.md`, "Layout" and "Conventions" |
| Mailflare's unit tests use Node's SQLite, and its browser tests run against `wrangler dev` | Mailflare CI workflow and test setup |
| Mailflare is deployed by Cloudflare Workers Builds on every push, never by hand | Mailflare `CLAUDE.md`, "Deploys" |
| Proscenium's test suites run on CI only and do not pass on Windows | `newtheatre/proscenium`: `CLAUDE.md`, "Tests run on CI only" |
| Proscenium records that no suite exercises the Cloudflare D1 driver | Proscenium's known-issues documentation |
| Proscenium keeps configuration keys in one registry with validation, and quotes policy numbers on content pages through tokens that CI checks | Proscenium `shared/utils/config.ts`, `scripts/check-content-tokens.ts`; `CLAUDE.md` invariant citing decision 0012 |
| Proscenium's atomicity is `db.batch` only, with conditional writes for contended claims and bound parameters chunked at 90 | Proscenium `CLAUDE.md`, invariants citing decisions 0001, 0003 and 0006 |
| Proscenium's append-only tables are enforced by triggers and erasure is anonymisation in one transaction | Proscenium `CLAUDE.md`, invariants citing decisions 0010 and 0011 |
| Proscenium's show night runs 04:00 to 04:00 in Europe/London | Proscenium `CLAUDE.md`, invariant citing decision 0014 |
| Flytower offers Stable and Beta release channels and documents updating | `teamflytower/flytower`: `docs/updating.md` |

These systems are sources of lessons only. No code, schema or file layout is taken from Proscenium; the design above is new.

## Cloudflare

| Claim | Source |
| --- | --- |
| Wrangler creates KV, R2, D1 and queue resources declared without identifiers on deploy, named after the Worker; when deployed from the dashboard or a connected repository the identifiers are not written back to the repository | Cloudflare docs, Wrangler configuration, "Automatic provisioning" (developers.cloudflare.com/workers/wrangler/configuration/); changelog 24 October 2025 |
| The Deploy to Cloudflare button clones a public repository into the user's account, lets them name the Worker and resources, provisions resources including D1, KV, R2, queues and Durable Objects, and sets up Workers Builds | Cloudflare docs, "Deploy to Cloudflare buttons" (developers.cloudflare.com/workers/platform/deploy-buttons/), last updated 12 October 2026 |
| The button reads `build` and `deploy` scripts from `package.json`, takes secrets from `.dev.vars.example`, and reads binding descriptions from `package.json` | The same page, "Best practices" |
| The documentation does not say whether the button's copy keeps commit history | The same page: it says "clones" and "newly created Git repository" and no more. Hence question 5. |
| A framework's build may generate the deploy configuration and redirect Wrangler to it | Cloudflare docs, Wrangler configuration, "Generated Wrangler configuration". Observed in the proof: Wrangler printed "Using redirected Wrangler configuration". |
| Workers Builds: 6,000 build minutes a month on paid plans, 20-minute build timeout, six concurrent builds | Cloudflare docs, Workers Builds "Limits & pricing", last updated 28 October 2026 |
| Workers Builds deploys the production branch with `wrangler deploy`; other branches create previews | Cloudflare docs, Workers Builds "Build branches" and "Configuration" |
| Changes to Durable Object classes must be applied by `wrangler deploy`, not a version upload | Cloudflare docs, "Deployment management", Limits |
| Cloudflare's Vitest integration runs tests inside workerd with local bindings and a helper to apply D1 migrations | Observed in the proof with `@cloudflare/vitest-plugin` 1.8.2; Cloudflare docs, Workers testing |
| A D1 batch is applied as one transaction and rolls back if any statement fails | Observed in the proof (the guarded batch wrote nothing); Cloudflare docs, D1 Worker API, `batch()` |

## Nuxt

| Claim | Source |
| --- | --- |
| Layers in `layers/` are registered automatically and take priority over layers named in `extends`; the project's own files take priority over all layers | Observed in proof 1 with Nuxt 4.6.4; Nuxt docs, "Layers" |
| Nuxt Content 3 stores collections in D1 on Cloudflare and can use Node's built-in SQLite at build time | Observed in the proof with Nuxt Content 3.16.2 (`experimental.sqliteConnector: 'native'`); Nuxt Content docs, deployment on Cloudflare |
| Nitro's Cloudflare preset merges a root Wrangler file with the configuration in `nuxt.config.ts`, the latter winning | Observed in proof 2 |

## GitHub

| Claim | Source |
| --- | --- |
| Scheduled workflows are disabled in a fork until its owner enables them, and are disabled after 60 days without repository activity | GitHub Actions documentation. From memory, not re-read for this document; to be confirmed when the update action is built. |
| A fork of a public repository is itself public | GitHub documentation on forks. From memory. |
| Hosted runners for Linux, Windows and macOS are free for public repositories | GitHub Actions billing documentation. From memory. |

## The proofs' own materials

The proof repositories were throwaway and are not kept as product code. What is preserved is in the Proofs tab: the method, every result, and the three findings. Rebuilding them takes under an hour from that description, and question 4 proposes putting the test harness in a real repository.
