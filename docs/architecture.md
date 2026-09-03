# Architecture

How the unified system is put together. The decisions in `decisions/` are the why; this is
the shape. Companion: `data-model.md` for every table.

## Runtime

One Nuxt 4 application on Cloudflare Workers (`cloudflare_module` preset), one D1 database,
one deployed worker serving `newtheatre.org.uk`. There are no other services: no queues, no
Durable Objects, no cross-app calls. Email leaves through the `send_email` binding (Email
Service, decision 0002) as one of five sender identities on the single onboarded domain
`newtheatre.org.uk`, none of them a `no-reply` (0020); files (posters, venue images) live in
R2; secrets shared beyond one worker live in the account Secrets Store, hydrated by the
first-registered server plugin before anything reads a session (the `0.` prefix pattern
carried from the estate).

```mermaid
flowchart LR
  B[Browser or phone] --> N[Nuxt app, SSR and islands]
  N --> API[Nitro server routes]
  subgraph W[One Cloudflare Worker]
    API --> CORE[server/utils: db, session, authorise, ledger, notify, config, audit]
    CRON[Cron triggers] --> TASKS[Scheduled tasks] --> CORE
  end
  CORE --> D1[(D1 database)]
  CORE --> MAIL[send_email binding, five sender identities]
  CORE --> R2[(R2 assets)]
  SS[Secrets Store] -.hydrates first.-> CORE
```

## Code layout

Modules from the backlog map one-to-one onto directories. Nothing imports across module
boundaries except through `server/utils/` and `shared/`.

```
app/                    pages, components, composables, plugins (grouped per module)
server/
  api/<module>/         one route per file, Nitro conventions
  utils/                the shared spine: db, session, authorise, ledger, notify,
                        config, audit, conditional-write helpers
  tasks/                scheduled tasks (below)
  plugins/              0.secrets-store, authorisation resolver
shared/utils/           zod schemas, permission map, enums, pure domain logic
                        (Europe/London dates, expiry arithmetic, pricing resolution,
                        validity). Auto-imported into both the application and the server,
                        because a time shown to a member is pinned the same way as one the
                        server reasons about.
shared/types/           types shared across the same boundary
content/                Nuxt Content: editorial pages, policy pages with config tokens
migration/              the SP-3 tooling (standalone, never imported by the app)
tests/                  unit / integration / e2e, bun test
```

## Routes and shells

A prefix names the domain; the shell follows the posture of the work rather than the URL (0040).
`/admin` means System and nothing else.

| Prefix | Shell | Who |
| --- | --- | --- |
| `/`, `/sign-in`, `/register`, `/verify`, `/reset`, `/magic` | `default` | Anybody |
| `/rooms`, `/rooms/mine`, `/account/*` | `member` | A member, about themselves |
| `/rooms/manage/*`, `/people/*`, `/admin/*` | `console` | Somebody working for the theatre |
| `/tonight/*` | `tonight` | Somebody on shift, on a phone |

A domain with both audiences puts the member's screens at the top and the console's under `manage`
(`/rooms` against `/rooms/manage/requests`). A domain with no member surface sits flat
(`/people/accounts`, and `/bar/stock` when it lands). Every navigable destination is declared once
in `shared/utils/site-nav.ts`, which the console sidebar renders and the console middleware guards
from, so a deep link and the sidebar cannot disagree.

### Route namespaces

Which stream owns which routes while the MVP is built in parallel (`build-order.md`). Ownership is
about who edits a file, not about who may link to it: a stream adds a route inside its own
namespace, and asks the owner for one anywhere else.

| Stream | Routes and files owned |
| --- | --- |
| Box office | `/whats-on`, `/shows/[slug]`, `/book`, `/my/bookings`, `/admin/shows`, `/admin/ticket-types`, `/admin/passes`, `/tonight/door`, `content/` |
| Show night | `/rota`, `/admin/rota`, `/admin/templates`, `/admin/venues/[id]/emergency`, the `/tonight` hub, `/tonight/incidents`, `/tonight/register`, `/tonight/checklist`, `/tonight/board`, `/tonight/close`, `/board` |
| Bar | `/tonight/till`, `/tonight/till/comps`, `/admin/bar/**`, `/admin/stock/**` |
| Platform | `/account/notifications`, `/admin/notifications/**`, `/admin/config`, `/admin/docs`, `/policies/**`, `/admin/finance/**`, `/admin/backups`, `/admin/retention`, `migration/**`, `app/components/Night*.vue`, `app/composables/useNightCache.ts`, `tests/helpers/race.ts` |

`/tonight` is the one prefix three streams write under, which is why the shell below is owned by
one of them and settled before any of the screens are built. The hub page itself was written by
platform far enough to exercise the shell, and its content belongs to show night from E-112.

## The identity screens

`/sign-in` and `/register` are the two entry points, and each carries its own steps rather than
sending the visitor to a URL that means nothing on reload: the MFA challenge, the forgotten-password
and sign-in-link requests, and the check-your-email panel are all states of the page the person is
already on. Only three routes exist because an email points at them, and each is reached with a
token in the query string:

| Route | Consumes |
| --- | --- |
| `/verify?token=` | `POST /api/auth/verify`, offering a fresh send on a 410. A token issued by an address change is bound to that address and confirms no other (A-115) |
| `/reset?token=` | `POST /api/auth/password/reset` |
| `/magic?token=` | `POST /api/auth/magic-link/consume`, which may answer with an MFA attempt |

Who is signed in is read once during rendering by `app/plugins/account.server.ts` into the
`nnt-account` state, and re-read by `useAccount().refresh()` after anything that changes the
session. A component awaiting that read instead would hold Suspense open and ship a page that never
becomes interactive.

## Identity and authorisation

- Sealed first-party session cookie (nuxt-auth-utils), 30 days, epoch-revoked (0007).
  Privileged requests re-verify the user row every time; there is no staleness window.
- Authorisation resolves from three sources, in order:
  1. **Permissions** from held, unexpired roles via the static permission map in `shared/`.
     `server/utils/authorise.ts` owns this, and `requirePermission` is the guard.
  2. **Derived authority**: tonight's confirmed shift (04:00 to 04:00 London, `showNightOf`), a currently
     valid training record, department leadership. Computed by joins at request time, never
     cached beyond the request (0009). It resolves in the module utility that owns the fact it
     derives from, behind a guard of its own: `server/utils/training.ts` reads department
     leadership, and `requireCatalogueReader` and `requireCatalogueAuthority` are its guards.
     Trainer and supervisor standing resolve in the same file, through `trainerStandingOf` and
     the `requireTrainer` guard: somebody is a trainer if and only if they currently hold a
     record on a module marked trainer-granting, and expiring counts as held. It is never a role
     and never a flag, so revoking the certification is the whole of taking the standing away
     (0037, G-111).
  3. **Ownership**: the row's own user id.
- Guards are server-side and fail closed; route middleware is rendering convenience only.
- `nuxt-authorization` abilities (`shared/utils/abilities.ts`) are named views over the same
  permission map, used to decide what the chrome shows. Two resolvers hand an ability its viewer:
  `server/plugins/authorisation.ts` from the account row and its live grants,
  `app/plugins/authorization.ts` from the account snapshot. Neither reads authority from the
  cookie, and neither replaces `requirePermission`, which also holds the MFA gate (0040).
- MFA (TOTP + passkeys) is enforced at guard level for permission-bearing roles (0008).
- A passkey is a complete sign-in and no challenge follows it: the authenticator verified the
  person before it would sign, so the credential step and the second step happened at once
  (A-105). `nuxt-auth-utils` verifies both ceremonies with `requireUserVerification: false`, so
  that rule is enforced in `shared/utils/passkeys.ts` and checked in both handlers.

```mermaid
flowchart TD
  REQ[Request with sealed session] --> LIVE{User row exists, enabled, epoch current}
  LIVE -- no --> C401[401, cookie cleared]
  LIVE -- yes --> PERM{Permission from a held, unexpired role}
  PERM -- yes --> MFA{MFA enrolled where the role demands it}
  MFA -- yes --> OK[Handler runs]
  MFA -- no --> C403[403, enrolment required]
  PERM -- no --> DERIVED{Derived authority: confirmed shift tonight, valid training record, department leadership}
  DERIVED -- yes --> OK
  DERIVED -- no --> OWNER{Caller owns the row}
  OWNER -- yes --> OK
  OWNER -- no --> DENY[403]
```

## Money and the ledger

Every monetary fact posts to `ledger_entries` (+ `ledger_lines`) in the same batch as its
domain write (0004). `server/utils/ledger.ts` is the only writer. Reconciliation, dashboards
and exports are queries over the ledger; no module keeps its own money totals.

## Concurrency on D1 (0003, 0006)

- Atomicity is `db.batch` only. The contended claims (seat capacity, shift claim, register
  delivery, waiting-list offers, promotion notifications) are conditional writes: the guard
  predicate rides on the INSERT or UPDATE, zero-rows-affected is disambiguated explicitly
  (gone versus beaten), and at-most-once rules are unique indexes.
- Parameter discipline: chunk at 90, scope by subquery, never an IN list from a result set.
  Compound SELECTs also cap low on D1; use scalar subqueries for multi-count reads.
- Each claim has a racing test in CI (0016).

## Scheduled tasks

All Nitro scheduled tasks mirrored in wrangler cron triggers. The system notices, humans
decide (principle P6): no task ever awards a record, approves a request or takes money.

Every name in the table has a handler under `server/tasks/`, because a cron pointing at one that
does not exist errors on every firing. Seven of them are stubs that report the story they are
waiting for and do nothing else; only `daily:sweeps` does work today.

| Cron (UTC) | Task | Does |
| --- | --- | --- |
| `*/10 * * * *` | `holds:release` | Releases expired reservation holds, cascades waiting-list offers, sends pre-expiry reminders. The one task that changes booking state, and only ever in the direction the customer was warned about. |
| `0 6 * * *` | `training:expiry-sweep` | Expiry warnings and digests (dry-run gated). |
| `0 8 * * *` | `rooms:sweep` | Tells the approvers about room requests that have been waiting, once each, and lapses the ones that waited too long (C-108). Union requests are chased the same way but never lapse: expiry frees a held slot, and a union request holds none (0036). |
| `0 9 * * *` | `sessions:sweep` | Session reminders and unmarked-register nags (G-119, not yet built). |
| `0 10 * * *` | `shifts:remind` | Tomorrow's rota with calendar attachments. |
| `0 17 * * *` | `rooms:remind` | Tomorrow's room bookings, one message per member however many they hold, with the calendar file attached (C-113). Idempotent: a second run the same London day sends nothing, read from `notification_log` rather than a column. |
| `12 0 * * *` | `nights:close` | Auto-closes unsigned night reports inside 24 hours, retries unsent report emails. |
| `0 4 * * *` | `daily:sweeps` | Comp expiry tidy, backstage free-text purge, withdrawn access profiles, lapsed rate limits, lapsed MFA attempts, unclaimed sign-in tokens, notification retries, unverified account expiry (0026). |
| `0 5 * * 1` | `backup` | Weekly export to R2 (plus provider Time Travel). |
| `0 4 1 * *` | `retention:sweep` | Inactivity warnings and anonymisation (ships dry-run, armed by config with typed confirmation). |

## Notifications

One centre (`server/utils/notify.ts`, decision 0013): per-topic preferences, transactional
always delivers, digest coalescing, full send log with retries, undeliverable and anonymised
addresses dropped before the provider. Channels: email now, in-app inbox now, push when it
actually delivers.

## The show night (0014, E-110)

The operational day runs 04:00 to 04:00 Europe/London, and `shared/utils/show-night.ts` is its
only definition. A night is a label, `YYYY-MM-DD`, naming the London day it began; the 04:00
boundary is a constant in that file, never a configuration key.

| Function | Answers |
| --- | --- |
| `showNightOf(at: Date): string` | Which night an instant belongs to. A performance's night is `showNightOf(curtain)`, so a late show ending at 01:00 is one night. |
| `showNightBounds(night: string): { from, to }` | The instants a night runs between: `from` inclusive, `to` exclusive, both 04:00 London. The night the clocks change is a real 23 or 25 hours. A malformed label throws. |
| `currentShowNight(): string` | Tonight, from the runtime clock. The only place a night is read off the clock rather than off a stored instant. |
| `isShowNight(value: string): boolean` | Whether a string is a real night label, for validating a `night` query parameter. |

Shift authority, the door, the till, the tonight screens, board codes, night reports and the
cache label must call these as they are built; a second implementation is a defect (0014), and
`tests/unit/show-night.test.ts` fails on one. The financial day is not the show night: the
ledger and the Z reconciliation group by London calendar day (I-104).

## Show-night resilience (module K)

Operational screens (door, till, registers, tonight view) are phone-first islands that cache
their night's data on open and render fully from cache when the network drops; writes queue
and reconcile with conflicts surfaced, never merged silently. The emergency card caches at
shift start. Mechanism (service worker or client cache layer) is an open question in
`backlog/K-platform.md`; the acceptance criteria bind either way.

### The phone-first shell (K-102)

Three components under `app/components/` are what every show-night screen is assembled from, so
the door, the till and the registers inherit the conditions rather than each remembering them. The
`tonight` layout is settled and is not edited by the screens built on it.

| Component | Props | What it guarantees |
| --- | --- | --- |
| `NightScreen` | `title`, `hint?`, `stale?`, `busy?` | The column caps at `max-w-md` and lays out from 360 pixels up, so the desktop view is the adaptation. Its `actions` slot is pinned to the bottom of the viewport, which is where a thumb rests. |
| `NightAction` | `label`, `icon?`, `color?`, `disabled?`, `loading?`, `to?`, `@press` | At least 48 by 48 pixels, full width, and reachable by a single tap: no hover state, no long press, no second finger. |
| `NightStale` | `at?`, `busy?` | "Last synced HH:MM" in Europe/London, or "Not yet synced" when nothing has loaded. It is never hidden, because a screen holding nothing is when its age matters most. Words and an icon, never colour alone. |

`shared/utils/night-shell.ts` holds `NIGHT_VIEWPORT_PX`, `NIGHT_TAP_TARGET_PX` and
`lastSyncedLabel()`, so the tests and the components read the same numbers. A screen shows its own
age by passing `stale` the instant its data came from, which is what `useNightCache` (K-103) will
hand it.

## Environments

| | Database | Email | Payments |
| --- | --- | --- | --- |
| Local | D1 local SQLite under `.data/` | logged, and written to `.data/mail` so a link can be followed | dev tender stub |
| Preview (branch builds) | isolated preview D1 | logged | stub |
| Production | D1 `unified` | Email Service | the physical SumUp reader, always (0005) |

Development never hands a message to a provider, whatever bindings the emulator supplies, and every
emailed link is built from `NUXT_PUBLIC_BASE_URL`, which defaults to the local port in development
so a verification link in `.data/mail` is one that works.

Seed scripts generate credentials at runtime, print once, and refuse to run against remote
databases. `/dev` is the local developer surface: it seeds personas and signs in as any of them
without a password. It is kept out of a production build by `nuxt.config`'s `ignore` rather than by
a runtime guard, because a guard still ships the file, and a test greps the built output to prove
it (K-124).

## Deployment

Merging to `main` (once this branch becomes it) deploys via Workers Builds. Migrations apply from
`.github/workflows/migrate.yml` on push to `main` or `unified/main` when the run touches
`server/db/migrations/**` (restore point first, `nuxt-db migrate`, ledger re-read after), and
`/api/health` returns 503 naming pending migrations whenever the deploy is ahead of its schema.
Applying and deploying cannot be sequenced from CI, so the ordering is a race; the health check is
what makes losing it visible rather than silent.

CI gates, eleven of them: `build`, `typecheck`, `lint`, `typecheck:bun`, `test`, and the six
checkers (comments, migrations, content tokens, ledger, notifications, audit). `typecheck` and
`typecheck:bun` are separate compilers over separate projects, and passing one says nothing about
the other. `test:e2e` is **not** a gate: it runs nightly and on demand (0029).

## Testing (0016)

`bun test` throughout. Unit tests for the pure logic in `shared/`; integration tests run
routes against a real local database and carry the racing tests; end-to-end tests drive the
critical journeys (booking, door, till, register, room request) in a browser. The named
regression suite (K-121) is seeded before feature work and grows monotonically.

A browser test drives the real screen, so it must wait for the page to become interactive and not
merely to render: until Nuxt's Suspense resolves, the markup is server-rendered and a click does
nothing and reports nothing. `visit()` in `tests/helpers/webview.ts` waits for both, and `fill()`
sets a value through the native setter so `v-model` sees the change. One browser backs every view,
so views share a cookie jar: a case that needs a signed-out visitor opens one with
`openSignedOutView()` rather than assuming a new view carries no session.
