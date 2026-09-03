# Build order: the rest of the MVP

The order the remaining MVP stories are worked in, and how several people (or several streams
of work) build them at once without treading on each other. Written on 3 September 2026,
when 91 of the 201 MVP stories were merged: identity (A), rooms (C), training (G) and the
platform spine (J, K) were done, and box office (D), show night (E), the bar (F) and the
finance, communications and cutover tails remained. `roadmap.md` says when; this says in what
order and by whom.

Story ids are from `backlog/`; the wave tables below repeat each story's dependencies rather
than re-arguing them. Where a dependency crosses streams, the seam table says what the
consumer builds against if the provider is late.

## Where things stood on 3 September 2026

| Module | MVP | Built | Remaining |
| --- | --- | --- | --- |
| A identity | 26 | 23 | A-119, A-123, A-126 |
| C spaces | 24 | 24 | none |
| D ticketing | 30 | 0 | D-101 to D-130 |
| E show night | 27 | 0 | E-101 to E-127 |
| F bar | 21 | 0 | F-101 to F-121 |
| G training | 25 | 25 | none |
| H communications | 9 | 4 | H-102, H-104, H-105, H-106, H-108 |
| I finance | 9 | 1 | I-102 to I-109 |
| J governance | 9 | 4 | J-105, J-106, J-107, J-109, J-110 |
| K platform | 21 | 10 | K-102, K-103, K-104, K-105, K-108, K-111 to K-114, K-116, K-119 |
| **Total** | **201** | **91** | **110** |

What shapes the order:

- `data-model.md` already specifies every D, E and F table. The schema is designed, not built.
- Scheduled task stubs exist for `holds:release`, `sessions:sweep`, `shifts:remind`,
  `nights:close`, `backup` and `retention:sweep`, each naming the story it waits for.
- The `tonight` layout and a placeholder `/tonight` page exist. `content/` is empty.
- Every stream appends to the same shared registries, which CI checks: `LINE_KINDS` in
  `shared/utils/ledger.ts`, `MESSAGE_TYPES` in `shared/utils/notifications.ts`, the audit
  catalogue and coverage in `shared/utils/audit-*.ts`, and `config.ts`, `personal-data.ts`,
  `site-nav.ts` and `personas.ts` beside them.
- Merges to the integration branch are squash merges; the migration journal is one file; and
  `check:migrations` refuses any rebuild of an existing table, so nothing may add a NOT NULL,
  CHECK or foreign-key column to `rooms`, `users`, `ledger_*` or `training_*`. New tables point
  at old ones, never the reverse.

## Decisions taken to unblock the order

Two open questions had to be answered before the first shared contract could be written. Both
get a decision record in the pull request that builds them (Wave 0 below); until then, this is
the record.

- **A venue is its own row.** `venues` is a table, as `data-model.md` says. It may point at a
  room, but need not; when it does, the only effect of the attachment is that the venue's
  performances apply blackouts to that room. Nothing else about a room is inferred from a venue
  or the reverse. (Committee direction, 3 September 2026; answers the venue-or-room question
  E-101, E-113 and F-102 all turn on.)
- **The officer bypass of the rota carries.** Designated officer roles may open show-night
  screens without a shift; every use is audited and flagged in the night report's staffing
  section. (Answers module E open question 5; the old estate's behaviour, kept.)

## Wave 0: shared contracts, in series

Everything else waits for these seven pull requests, merged in this order. Only (d) carries a
migration. Roughly a week of work with a merge a day.

| | Contract | Owner | What it delivers | Who needs it |
| --- | --- | --- | --- | --- |
| a | E-110, the show-night boundary | show night | `shared/utils/show-night.ts`: `showNightOf(at)`, `showNightBounds(night)`, `currentShowNight()`; a night is labelled by the London day it began (`YYYY-MM-DD`); 04:00 is a constant in that file, not configuration; unit tests name the 23 and 25 hour nights. I-104 groups by London calendar day, not show night, and the file says so. | Holds and the door (D), F-101 and F-102, K-103's cache label, every E screen. |
| b | Ledger posting contract and registry sections | platform | `PASS_ADMISSION` joins `LINE_KINDS`; `architecture.md` gains a table fixing the (source, tender, kind) triple for every money path: desk collection, walk-up, refund by `reversesEntryId`, pass sale, pass admission at zero, bar item, tab settlement, void, import. `AUDIT_MODULES` gains ticketing, show night, bar, finance, communications. Every shared registry gains a comment banner per module so additions from different branches land in different hunks. | Every stream. `postEntry()` returns the statements the caller batches; nothing else inserts. |
| c | K-102, the phone-first shell | platform | `NightScreen`, `NightAction` (48 pixel minimum, no hover-only state) and `NightStale` ("last synced HH:MM") under `app/components/`; the route namespace table below recorded in `architecture.md`; the one-handed walkthrough as a checklist in `operations.md`. After this nobody else edits `app/layouts/tonight.vue`. | The door (D), the till (F), every E screen. |
| d | Programme schema | box office | One migration: `venues` (nullable `room_id`, blackouts only), `venue_emergency_info`, `seasons`, `show_categories`, `shows`, `content_warnings`, `show_content_warnings`, `performances`, `ticket_types`, `show_ticket_overrides`, `performance_ticket_overrides`, columns as in `data-model.md`. `server/utils/performances.ts` with `performanceNight()`, `performancesOnNight(night, venueId?)`, `effectiveCapacity()`, `isOnSale()`. The seed gains one venue and one show with a performance tonight and one next week; `tests/helpers` gains `tonightsPerformance()`. Personal-data registry rows. The venue decision record. | E-101, E-102, E-108, E-113, F-102, I-106, K-103. |
| e | D-119, ticket type administration | box office | The admin screen over `ticket_types`. | D-120, D-121, D-123. |
| f | D-121 and D-112, publish flow and booking window | box office | Show and performance administration and the publish flow; the per-performance booking window. | D-101, D-102, D-122; E-102. |
| g | E-111, the officer branch only | show night | `server/utils/night-authority.ts`: `NightRole` is `DUTY_MANAGER`, `DOOR` or `BAR`; `requireNightAuthority(event, role, scope?)` resolves `{ account, night, role, venueId, performanceIds, via, shiftId? }` where `via` is `SHIFT` or `OFFICER`; a refusal is a 403 naming what would unlock it. Only the `OFFICER` branch ships: permissions `night:door`, `night:till`, `night:manage` in `shared/utils/abilities.ts`, and an audit action `night.officer-bypass` written once per account per night per role. The seed gains a bar-manager and a FOH-officer persona. The bypass decision record. The `SHIFT` branch arrives in show night wave 3 with no change to the signature. | F-101 (BAR), D-126 (DOOR), every `/api/tonight/**` and `/api/till/**` route. |

## The four streams

One stream per area, each on its own branches, each opening small pull requests into the
integration branch. Sizes: S is one point, M two, L three. Inside a wave, a "·" separates
pull-request-sized groups; groups on one line can be built at the same time. Each group is one
pull request, titled in the repository's habit: a sentence, then the ids in parentheses.

| Stream | Stories | Branch prefix | Dev port | End-to-end base port |
| --- | --- | --- | --- | --- |
| box office | 30 | `unified/box-office/` | 3011 | 3201 |
| show night | 27 | `unified/show-night/` | 3012 | 3301 |
| bar | 21 | `unified/bar/` | 3013 | 3401 |
| platform | 32 | `unified/platform/` | 3014 | 3501 |
| the reviewer | | | 3001 | 3701 |

Ports matter: the end-to-end runner refuses a held port, and worse, accepts a leaked dev server
from another checkout and then reports every new route as missing (`known-issues.md`). Set
`NUXT_PORT` and `E2E_BASE_PORT` together, and set `NUXT_HUB_DIR=/tmp/nnt-dev-<stream>` so a
build does not break the running dev server.

### Box office (module D)

| Wave | Pull-request groups | Notes |
| --- | --- | --- |
| 1 | D-101 + D-102 · D-105 + D-120 · D-122 + D-123 · D-127 · D-103 | All hang off Wave 0. D-105 is the capacity predicate on `tickets` inserts; land it before D-104. D-103 puts the first pages under `content/`. |
| 2 | D-104 · D-106 + D-107 · D-108 + D-109 | D-104 first, alone. D-106 wakes `holds:release`. |
| 3 | D-114 · D-110 + D-111 · D-113 · D-128 + D-130 | D-114 is the first desk money path (`TICKET_COLLECTION`). |
| 4 | D-115 + D-117 · D-116 + D-118 · D-124 · D-129 | D-116 carries the double-refund racing test. D-124 posts `PASS_SALE`. |
| 5 | D-125 + D-126 | D-126 is the door scan under `DOOR` authority; it adopts `useNightCache` if that has merged. |

Routes owned: `/whats-on`, `/shows/[slug]`, `/book`, `/my/bookings`, `/admin/shows`,
`/admin/ticket-types`, `/admin/passes`, `/tonight/door`, `content/`.

### Show night (module E)

| Wave | Pull-request groups | Notes |
| --- | --- | --- |
| 1 | E-101 + E-102 + E-106 · E-108 | E-106's CHECK and partial UNIQUE go in the same migration as `shifts`, so the table is born constrained. |
| 2 | E-103 · E-104 + E-105 | E-103 calls `modulesHeldBy()` and `heldNow()`. E-104 carries the shift-claim racing test. |
| 3 | E-111 shift branch + E-107 · E-109 | E-109 wakes `shifts:remind`. When E-111 merges, the bar can write F-101's "a DOOR shift does not open the till" test. |
| 4 | E-112 · E-115 + E-117 · E-118 · E-114 · E-120 | The widest point. E-112 first; E-118 next, because F-106 waits on it. |
| 5 | E-113 · E-116 + E-119 · E-121 + E-122 | E-113 needs K-103 from platform. |
| 6 | E-123 · E-124 + E-125 | E-125 wakes `nights:close`. |
| 7 | E-126 · E-127 | E-127 can start in wave 6 once E-113 is merged. |

Routes owned: `/rota`, `/admin/rota`, `/admin/templates`, `/admin/venues/[id]/emergency`, the
`/tonight` hub, `/tonight/incidents`, `/tonight/register`, `/tonight/checklist`,
`/tonight/board`, `/tonight/close`, `/board`.

### Bar (module F)

| Wave | Pull-request groups | Notes |
| --- | --- | --- |
| 1 | F-111 + F-114 · F-112 + F-116 · F-113 | F-114 is the append-only `stock_movements` table; its triggers are hand-authored after the CREATE, as migration 0001 did for `audit_log`. |
| 2 | F-101 + F-102 · F-115 + F-120 · F-121 | F-101 and F-102 build against the E-111 officer branch. F-102 keys on `venues.id` and `showNightOf()`. |
| 3 | F-103 + F-107 · F-104 | |
| 4 | F-105 · F-117 | F-105 batches `postEntry` statements with `stock_movements`; carries the atomic-sale racing test. |
| 5 | F-108 · F-106 · F-110 | F-106 needs E-118; F-110 needs E-112. If either is late, pull F-119 forward. |
| 6 | F-109 · F-119 | |
| 7 | F-118 | I-104 reads its close record when present and reconciles without it otherwise. |

Routes owned: `/tonight/till`, `/tonight/till/comps`, `/admin/bar/**`, `/admin/stock/**`.

### Platform (modules A, H, I, J, K)

| Wave | Pull-request groups | Notes |
| --- | --- | --- |
| 1 | K-103 · K-105 harness + J-106 · K-108 + J-107 · K-112 · K-111 + A-126 | K-103 builds `useNightCache(key, loader)` against the placeholder and a seeded performance; show night and bar adopt it. K-105 here is only `tests/helpers/race.ts` and splitting `races.test.ts` and `money.test.ts` into per-invariant files, before D-105 and F-105 both try to fill the same file. J-106: verify the existing endpoint against its criteria and close. K-108 wakes `backup`; K-111 wakes `retention:sweep`. |
| 2 | H-102 + H-104 · H-105 + H-106 · J-109 + J-110 · K-113 · I-106 | H-105's retries are what `nights:close` and D-107 lean on. J-110 makes `check:content-tokens` real: keep it small and early. I-106 needs D Wave 0 only and uses `IMPORT` rows until D-114 posts real ones. |
| 3 | A-119 · H-108 · K-114 + I-109 · K-116 · J-105 | K-116 needs F-115 (bar wave 2). |
| 4 | A-123 · I-102 · K-104 | I-102 closes when D-114, D-116, D-124, F-105 and F-108 have each added their row to the checklist test, each in its own pull request; I-102's own pull request asserts the list is complete. K-104 needs a real door write and a real till write to reconcile against. |
| 5 | I-103 + I-104 · I-105 · K-105 close | K-105 closes when the four racing tests (D-105, E-104, F-105, register marks) are in CI. |
| 6 | I-107 + I-108 · K-119 | K-119 needs K-112, K-114, K-116. |

Routes and files owned: `/account/notifications`, `/admin/notifications/**`, `/admin/config`,
`/admin/docs`, `/policies/**`, `/admin/finance/**`, `/admin/backups`, `/admin/retention`,
`migration/**`, `app/components/Night*.vue`, `app/composables/useNightCache.ts`,
`tests/helpers/race.ts`.

If platform falls behind, split finance (module I with K-112 to K-119) into a fifth stream.
Nothing else in platform is on the critical path.

## The critical path

Read literally (E-111 depends on E-104), the longest chain is 38 points and crosses all four
streams: D-119, D-121, E-102, E-103, E-104, E-111, F-101, F-102, F-103, F-104, F-105, F-108,
I-102, I-103, I-104, I-107, I-108.

Wave 0's officer branch of E-111 cuts the show-night segment out of that chain. Three chains
then tie at 28 points:

- bar to finance: F-114, F-112, F-116, F-103, F-104, F-105, F-108, then I-102, I-103, I-104,
  I-107, I-108;
- box office to finance: D-119, D-121, D-101, D-104, D-108, D-114, D-116, then I-102 onwards;
- show night alone: D-119, D-121, E-102, E-103, E-104, E-111, E-112, E-123, E-124, E-125, E-126.

So after Wave 0 the pace is set by whichever of box office, show night and bar falls behind,
and the finance tail (eleven points) cannot start until both D-116 and F-108 are merged.
Review priority follows: Wave 0 first, then any pull request carrying a migration, then pull
requests on those three chains, then the rest.

## Seams between streams

Provider first, consumer second. "If late" is what the consumer builds against meanwhile.

| Provider, consumer | What crosses | If late |
| --- | --- | --- |
| D Wave 0; E-102, E-108, E-113, F-102, I-106, K-103 | `venues`, `performances`, `performancesOnNight()` | Nothing: Wave 0 gates the fan-out. |
| E-110; everything nightly | `showNightOf()` | Nothing: it merges first. |
| E-111 officer branch; F-101, D-126, every E screen | `requireNightAuthority()` | The officer branch is the provision; officer personas until the shift branch lands. |
| E-111 shift branch; F-101's end-to-end test | A confirmed BAR shift opening the till | F-101 asserts the refusal wording only until show night wave 3. |
| E-112; F-110 | The duty manager's approvals link | F-110 ships under `night:manage`; E-112 adds the link afterwards. |
| E-118; F-106 | `age_checks` and `recordAgeCheck()` | Hard dependency; scheduled a wave apart. |
| K-102; the door, the till, every E screen | `NightScreen`, `NightAction`, `NightStale` | Nothing: Wave 0. |
| K-103; E-113, D-126, F-103 | `useNightCache()` | Screens ship with `useFetch` and adopt the cache in a follow-up pull request. |
| K-105 harness; D-105, E-104, D-116, F-105 | `tests/helpers/race.ts` | Each story writes its race with `Promise.all` over `$fetch`, as the suites already do. |
| D-114, D-116, D-124, F-105, F-108, F-109; I-102 | One ledger row per kind | Each provider adds its row to the checklist test in its own pull request. |
| F-117; I-103 | `discount_id` and `discount_percent` on entries | The columns exist; I-103 tolerates zero rows. |
| F-118; I-104 | A bar session close carrying the SumUp Z | I-104 reconciles from ledger rows alone and reports "no bar session closed". |
| F-115; K-116 | Stocktake apply | Hard dependency; two waves apart. |
| H-105; D-107, E-109, E-124, E-125 | Retries | `notify()` already writes `notification_log`; consumers send once. |
| D-114 and F-105; K-104 | Idempotent write endpoints | The queue is tested against a fake endpoint; the reconciliation test waits for the real invariants. |

## Rules every stream follows

1. **Branch from the integration branch, never `main`.** The first command in any fresh
   checkout is `git fetch origin && git checkout -B unified/<stream>/<ids> origin/unified/main`.
2. **One migration per pull request, generated last.** Before asking for review: rebase onto
   the integration branch, delete the branch's own `.sql`, snapshot and journal entry, and
   regenerate so the number follows the merged head. Never keep both journal entries, never
   hand-edit a generated file.
3. **At most two open pull requests per stream.** A third stacked on an unmerged migration
   renumbers twice. With two open, write the next story's failing tests and documentation, or
   take an independent group from the same wave. A stacked branch records its base commit and
   rebases with `git rebase --onto` after the squash merge; its pull request opens only after
   the first merges.
4. **Append to shared registries inside your module's banner section:** ledger kinds, message
   types, audit catalogue and coverage, configuration keys, the personal-data registry, site
   navigation, personas.
5. **Seed changes only in Wave 0 and show night wave 1.** Later fixtures go through
   `tests/helpers`.
6. **Run the full CI list before opening a pull request** (`CONTRIBUTING.md` names the eleven
   steps), then the affected end-to-end suites on your own base port.
7. **A pull request that wakes a stub task** (`holds:release`, `shifts:remind`, `nights:close`,
   `backup`, `retention:sweep`) updates the task table in `architecture.md` and the row in
   `known-issues.md`.
8. **Checker traps.** `check:ledger` reads comments, so do not write "insert" beside a ledger
   table name. `check:notifications` rejects the bare identifier `EMAIL` in `server/**` outside
   `notify.ts`. `check:comments` rejects an em dash in `.sql`, `.md` and `.json` too. Every new
   table naming a person needs a `personal-data.ts` row and an erasure fixture.
9. **The pull request description** names the story ids, quotes which criteria the tests pin,
   records any interpretation, and links the seam contract if it introduced one.
10. **Before clearing a port**, `ps -eo pid,args | grep "[r]un-tests.ts"` and see whose it is.

## Keeping this document true

A stream that finds a seam's "if late" column wrong corrects it here in the pull request that
discovered it. When a wave completes, nothing here changes: the tracker records where a story
stands, and this document records the order it was worked in.
