# Architecture

## The shape of it

One Nuxt 4 application does everything: the public website, the customer account area, the admin
back office and the box office. There is no separate API service, no background worker, no queue.

```
                 ┌──────────────────────────── Cloudflare ────────────────────────────┐
                 │                                                                     │
  browser ──────▶│  Worker (Nitro `cloudflare_module`)                                 │
                 │    ├── Vue 4 SSR + client hydration     app/                        │
                 │    ├── Nitro server routes              server/api/**               │
                 │    └── Nuxt Content (D1-backed)         content/**                  │
                 │             │                    │                                  │
                 │             ▼                    ▼                                  │
                 │        D1 (SQLite)          R2 (blobs)                               │
                 │        via Drizzle          posters, venue images                    │
                 └─────────────┬───────────────────────────────────────────────────────┘
                               │
                               ▼
                        Resend (transactional email)
```

Everything runs inside one Worker request. There is nowhere for a long-running job to live.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Nuxt 4.3 | `app/` is srcDir; Nitro preset `cloudflare_module` |
| Hosting | Cloudflare Workers via NuxtHub 0.10.6 | `hub: { db: 'sqlite', blob: true, kv: false, cache: false }` |
| Database | Cloudflare D1 (SQLite) | Drizzle 0.45, migrations in `server/db/migrations/sqlite/` |
| Object storage | Cloudflare R2 | Bucket `proscenium-blob`, served via `/images/**` |
| UI | Nuxt UI v4 | Theme in `app/app.config.ts` — primary purple, secondary orange |
| Auth | `nuxt-auth-utils` | Sealed cookie sessions |
| Authorisation | `nuxt-authorization` | Abilities in `shared/utils/abilities/` |
| Validation | Zod v4 | `readValidatedBody(event, schema.parse)` throughout |
| Email | Resend | `server/utils/email.ts` |
| CMS | Nuxt Content 3 | Only four markdown pages today |

## Where the code lives

```
app/            Vue: pages, components, layouts, middleware. One composable.
server/
  api/          63 Nitro handlers, file-based routing
  db/schema/    Drizzle tables — the source of truth for the data model
  db/migrations/sqlite/   0000–0008
  utils/        Shared server logic: auth, email, images, tickets, validation
  tasks/        Nitro tasks. Only `db:seed`
  routes/       Non-API routes. Only blob serving
shared/         Code used by both sides. Abilities live here — this is why
                the same permission check runs on client and server
content/        Markdown pages
```

**`shared/utils/abilities/` is the most important directory to understand.** Permission rules are
declared once and consumed by both the server (`authorize(event, ability)`) and the client
(middleware, conditional rendering). If you add an endpoint, add its ability there.

**`server/utils/` is where duplication should go to die.** It currently holds the only shared
ticket-price resolution (`tickets.ts`). Several rules that ought to live there are instead copied
across handlers — see [09-known-issues](./09-known-issues.md).

## Request lifecycle

A public booking is representative:

1. Browser POSTs `/api/bookings`.
2. Nitro routes to `server/api/bookings/index.post.ts`.
3. `readValidatedBody(event, bodySchema.parse)` — invalid input throws a 400 before any work.
4. `getUserSession(event)` reads the sealed cookie. No session is fine; guests can book.
5. Handler queries D1 through Drizzle, writes rows, and returns JSON.
6. The confirmation email is fired through `event.context.cloudflare.context.waitUntil()` so the
   response is not held up by Resend.

Server-rendered pages follow the same path with `useFetch` running server-side on first load and
client-side on navigation.

## The constraints Workers and D1 impose

These are the things that make this codebase look odd if you come from a Node/Postgres background.
None of them are mistakes.

**There are no interactive transactions.** D1 supports `db.batch()` — an atomic set of statements
decided up front — but not `BEGIN`/`COMMIT` around application logic. Anything requiring
read-then-write atomicity has to be either restructured into a batch or pushed into a database
constraint. Today most multi-statement operations are neither, which is the single biggest
correctness gap in the app ([09-known-issues](./09-known-issues.md#nothing-is-transactional)).

The practical rule: **if an invariant matters, express it as a UNIQUE index.** That is why the
passes design puts entitlement in `UNIQUE (pass_id, performance_id)` rather than in a check.

**There is a parameter limit.** SQLite binds a bounded number of parameters per statement;
`server/api/reservations/index.get.ts` chunks `IN` clauses at 800 for exactly this reason. Copy that
pattern rather than rediscovering it.

**There are no long-running jobs.** No cron, no queue consumer, no scheduled dyno. `waitUntil` lets
you finish something after the response, within the request's lifetime — that is all. Anything that
needs to happen on a schedule (booking reminders, retention sweeps) needs Cloudflare Cron Triggers,
which are not configured. `sendBookingReminderEmail` is written and never called for this reason.

**CPU time is limited per request.** Avoid unbounded loops over query results. Several admin
endpoints currently fetch and aggregate in JavaScript where SQL would do; fine at this data volume,
worth remembering at ten times it.

**The filesystem is read-only.** Uploads go to R2, never to disk.

## Deployment

`bun run build` produces `.output/`, and `wrangler --cwd .output deploy` ships it. NuxtHub generates
the Wrangler config into `.output/` at build time, which is why the deploy command is run from
there. Custom domains `newtheatre.org.uk` and `proscenium.newtheatre.org.uk` are configured in
`nuxt.config.ts`. See [08-operations](./08-operations.md).

There is no CI, no staging environment and no automated test suite. Deployment is a person on a
laptop. Treat that as the current risk profile rather than a target state.

## Deliberate architectural decisions

**One app, not a service split.** The theatre has one developer at a time and a twelve-month
handover cycle. A second deployable would double the operational surface for no benefit at this
size. The auth service ([ADR-0002 in `newtheatre/auth`](https://github.com/newtheatre/auth)) is the
exception, and only because identity genuinely is shared across several apps.

**Money in integer pence, everywhere.** No floats, no decimals. The legacy system used
`DecimalField` and reconstructing historic unit prices from it turned out to be impossible; this
avoids the class of problem entirely.

**Prices are snapshotted onto tickets.** `tickets.pricePaid` records what was owed at the moment the
ticket was issued, so changing a price later does not rewrite history. See
[06-pricing-and-ticket-types](./06-pricing-and-ticket-types.md) for where that promise currently
leaks.

**Guest checkout creates a real user row with a null password.** It means booking history is never
orphaned, and a guest who later registers on the same email simply *becomes* the owner of their past
bookings. This is also the contract the central auth service is built around.

## Known architectural weaknesses

Listed here so they are not rediscovered; detail in [09-known-issues](./09-known-issues.md).

1. Nothing is transactional, and D1 makes the fix non-obvious.
2. Capacity is enforced in one handler and bypassed by two others.
3. The ticket-type resolution rule exists in five copies.
4. There is no shared type layer — at least six divergent `Reservation` interfaces are declared
   across pages, components and handlers, with server responses cast rather than inferred.
5. There is no audit trail. The legacy Django system had one; this does not.
