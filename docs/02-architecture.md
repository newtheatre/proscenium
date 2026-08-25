# Architecture

## The shape of it

One Nuxt 4 application does everything: the public website, the customer account area, the admin
back office and the box office. There is no separate API service, no background worker, no queue.

```
                 ┌──────────────────────────── Cloudflare ────────────────────────────┐
                 │                                                                     │
  browser ──────▶│  Worker (Nitro `cloudflare_module`)                                 │
                 │    ├── Vue 3 SSR + client hydration     app/                        │
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
| UI | Nuxt UI v4 | Theme in `app/app.config.ts`: primary purple, secondary orange |
| Auth | `nuxt-auth-utils` | Sealed cookie sessions |
| Authorisation | `nuxt-authorization` | Abilities in `shared/utils/abilities/` |
| Validation | Zod v4 | `readValidatedBody(event, schema.parse)` throughout |
| Email | Resend | `server/utils/email.ts` |
| CMS | Nuxt Content 3 | Only four markdown pages today |

## Where the code lives

```
app/            Vue: pages, components, layouts, middleware. One composable.
server/
  api/          62 Nitro handlers, file-based routing (plus one blob route under server/routes/)
  db/schema/    Drizzle tables: the source of truth for the data model
  db/migrations/sqlite/   0000–0016
  utils/        Shared server logic: auth, email, images, tickets, validation
  tasks/        Nitro tasks. Only `seed`
  routes/       Non-API routes. Only blob serving
shared/         Code used by both sides. Abilities live here: this is why
                the same permission check runs on client and server
content/        Markdown pages
```

**`shared/utils/abilities/` is the most important directory to understand.** Permission rules are
declared once and consumed by both the server (`authorize(event, ability)`) and the client
(middleware, conditional rendering). If you add an endpoint, add its ability there.

**`server/utils/` is where duplication should go to die.** It currently holds the only shared
ticket-price resolution (`tickets.ts`). Several rules that ought to live there are instead copied
across handlers: see [09-known-issues](./09-known-issues.md).

## Request lifecycle

A public booking is representative:

1. Browser POSTs `/api/bookings`.
2. Nitro routes to `server/api/bookings/index.post.ts`.
3. `readValidatedBody(event, bodySchema.parse)`: invalid input throws a 400 before any work.
4. `getUserSession(event)` reads the sealed cookie. No session is fine; guests can book.
5. Handler queries D1 through Drizzle, writes rows, and returns JSON.
6. The confirmation email is fired through `event.context.cloudflare.context.waitUntil()` so the
   response is not held up by Resend.

Server-rendered pages follow the same path with `useFetch` running server-side on first load and
client-side on navigation.

## Fetching in the admin area

Admin pages fetch **on the server**, so a table arrives populated rather than appearing a moment
after the page does. Two rules come with that, and both are easy to get wrong.

**1. Forward the session, or SSR gets a 403.**

Every admin endpoint is behind `authorize()`, and a plain `useFetch` running on the server does
**not** forward the incoming session cookie, so the handler sees no session and denies the request.
Pass Nuxt's request-scoped fetch:

```ts
const { data } = await useFetch<Show[]>('/api/shows', { $fetch: useRequestFetch() })
```

and for `useAsyncData`, hold one instance and call it inside the handler:

```ts
const requestFetch = useRequestFetch()
const { data } = await useAsyncData('admin-reservations',
  () => requestFetch('/api/reservations', { query: { page: page.value } }))
```

This is why the admin pages were originally written with `lazy: true`, deferring to the client
sidestepped the cookie problem, because the browser sends it naturally. It also left every admin
page with a window where its data was `null`, which is what made the render loop below possible.
`useRequestFetch()` is the fix; `lazy` was the workaround.

**2. Never build the table's `data` prop in the template.**

```vue
<!-- wrong: a new array every render -->
:data="rows ?? []"
```

UTable rebuilds its TanStack row models whenever `data` changes identity, and rebuilding writes back
through the `v-model:` bindings, which re-renders the page, which allocates another array. That is a
render loop with no fixed point: a locked tab, not a slow one. It froze `/admin/shows` and
`/admin/ticket-types`. Bind a computed that always returns an array, and hoist
`:pagination-options` to a constant for the same reason.

Modals keep `lazy: true` deliberately: they fetch when opened, and blocking a page on data the user
may never look at is the wrong trade.

**3. A shared key does not dedupe concurrent callers.**

`useAsyncData` reuses a result that already exists; it does not join a request that is still in
flight. Three components mounting in the same tick all find nothing cached and all fetch. That is why
`app/composables/useVenues.ts` memoises the **promise** on the Nuxt app instance rather than relying
on a key, and why it hangs it off `nuxtApp` and not module scope, which on the server is shared
between concurrent requests.

## The admin component layer

`app/components/Admin/` is deliberately small. Most of what looked like duplication across the admin
pages was code that should not have existed at all, because the layout and Nuxt UI already provide it.

| Piece | What it is for |
|---|---|
| `Admin/Page.vue` | The page root. Almost nothing: see below. |
| `Admin/TableToolbar.vue` | Filters left, actions right. Not `UDashboardToolbar`, which only works inside `UDashboardPanel #header`. |
| `Admin/TableColumnToggle.vue` | The "Display" menu. Confines the `any`-typed `tableApi` access to one file. |
| `Admin/TablePagination.vue` | The footer. Takes **numbers**, never a table handle. |
| `Admin/FetchError.vue` | What a page shows when its fetch failed. |
| `app/utils/format.ts` | `toDate`, `formatDateTime`, `formatDate`, `formatTime`, `formatMoney`, `formatCount`. |
| `app/composables/useDebouncedRef.ts` | Search boxes that feed a server query. |

Four rules came out of building it, and they are the reason the layer is shaped this way:

**The layout already owns the page chrome.** `UDashboardPanel`'s `#body` slot supplies
`flex flex-col gap-4 sm:gap-6 flex-1 overflow-y-auto p-4 sm:p-6`, and `UDashboardNavbar` renders a
real `<h1>` from `route.meta.title`. Pages had grown five different root wrappers that all fought it
by doubling the padding, nesting a second scroll container, or dropping the padding entirely, and
five in-body `<h1>`s that made every page ship two. `AdminPage` exists only because eslint requires a
single template root. **Do not add a page heading; set `title` in `definePageMeta` and make it match
the sidebar entry.**

**There is no `<AdminDataTable>`, on purpose.** `UTable` stays in the page, bound to a page-owned
`computed`. A wrapper would have to re-expose every `v-model:` the table takes, and each layer is
another place a fresh array or object identity can be minted per render, which is the render loop
above.

**Nothing reads TanStack's row model from a template.** `table?.tableApi?.getFilteredRowModel()
.rows.length` in a footer re-walks the whole model on every render. Pages own their filter state and
compute their own counts, which is also why search is a plain `v-model` rather than TanStack
`columnFilters`.

**Prefer the component that exists.** Empty states are `UTable`'s `#empty` slot with `<UEmpty>` in
it, not a hand-built div after the table. Destructive confirmations are `useConfirm()`, not a
hand-rolled `UModal`: there were four of those.

**Two layout rules the flexbox defaults get wrong.** `AdminPage` sets `min-w-0` and `shrink-0` on
its children, and both are load-bearing. A flex item defaults to `min-width: auto`, so a wide table
refuses to be narrower than its content and pushes the whole panel sideways instead of scrolling
itself; and a column flex container shrinks its children vertically, which silently squashed a
two-line alert to one and cut the second line in half. Relatedly, **do not put `table-fixed` on a
table**: fixed layout ignores content and divides the width evenly, so with `whitespace-nowrap` cells
a long email is clipped mid-word while a status column sits half empty. Auto layout plus the table
root's own `overflow-auto` is what makes these usable on a phone.

## Modals versus sections

The rule that came out of rebuilding the shows area: **a modal is for a drill-in, not for a
property.**

A show's details, its content warnings and its ticket prices are properties of the show, so they are
sections of `/admin/shows/[id]`: three editable cards, each saving only the fields it owns through
the partial `PUT /api/shows/:id`. They were previously a 600-line `ShowEditModal` and a
`ShowTicketTypesModal` opened from a read-only summary of the same data, so managing a show meant
reading its details, opening a dialog containing those details again, and editing them there.

What legitimately stays a modal: creating a show (a wizard launched from the list), and anything
scoped to one row of a table: editing a performance, or setting a performance's ticket-type
overrides. Those are drill-ins from a list, and a section per row would be noise.

One consequence worth knowing: because the sections live on the detail page, the list page's
"Ticket types" row action **navigates** to `/admin/shows/:id#ticket-types` rather than opening
anything. One place to manage a show beats two entry points to the same form.

## The constraints Workers and D1 impose

These are the things that make this codebase look odd if you come from a Node/Postgres background.
None of them are mistakes.

**There are no interactive transactions.** D1 supports `db.batch()`: an atomic set of statements
decided up front, but not `BEGIN`/`COMMIT` around application logic. Anything requiring
read-then-write atomicity has to be either restructured into a batch or pushed into a database
constraint. Today most multi-statement operations are neither, which is the single biggest
correctness gap in the app ([09-known-issues](./09-known-issues.md#nothing-is-transactional)).

The practical rule: **if an invariant matters, express it as a UNIQUE index.** That is why the
passes design puts entitlement in `UNIQUE (pass_id, performance_id)` rather than in a check.

**D1 allows at most 100 bound parameters per statement.** That is low enough to be hit by ordinary
data, and the failure is a runtime error on production volumes rather than anything a local SQLite
run will show you. There are two established ways round it, and which one applies depends on whether
you are reading or writing.

*Reading: bind a subquery, not an id list.* `server/api/reservations/index.get.ts` never binds the
ids it filters on: `showPerformances` and `matchingUsers` are `IN (SELECT …)` subqueries, so the
number of parameters is fixed no matter how many rows match. Only the page's own ids are bound as a
list, and only because `limit` is capped. `server/api/shows/index.get.ts` avoids id lists the other
way, by grouping the whole table and stitching in memory.

*Writing: chunk.* `server/api/shows/[id]/index.put.ts` inserts content-warning links `CHUNK = 30` at
a time because each row binds three parameters (show, warning, level) and one imported show carried
72 warnings;
`server/api/_hooks/auth/last-activity.post.ts` chunks at 90 for one parameter per row. Divide 100 by
the parameters per row and leave headroom.

**There are no long-running jobs.** No cron, no queue consumer, no scheduled dyno. `waitUntil` lets
you finish something after the response, within the request's lifetime: that is all. Anything that
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
size. The planned central auth service is the exception, and only because identity genuinely is
shared across several apps.

**Money in integer pence, everywhere.** No floats, no decimals. The legacy system used
`DecimalField` and reconstructing historic unit prices from it turned out to be impossible; this
avoids the class of problem entirely.

**Prices are snapshotted onto tickets.** `tickets.pricePaid` records what was owed at the moment the
ticket was issued, so changing a price later does not rewrite history. See
[06-pricing-and-ticket-types](./06-pricing-and-ticket-types.md) for where that promise currently
leaks.

**Guest checkout creates a real user row with a null password.** It means booking history is never
orphaned, and a guest who later registers on the same email simply *becomes* the owner of their past
bookings. This is also the contract the planned central auth service is designed around.

## Known architectural weaknesses

Listed here so they are not rediscovered; detail in [09-known-issues](./09-known-issues.md).

1. Nothing is transactional, and D1 makes the fix non-obvious.
2. Capacity is enforced in one handler and bypassed by two others.
3. The ticket-type resolution rule exists in five copies.
4. There is no shared type layer: at least six divergent `Reservation` interfaces are declared
   across pages, components and handlers, with server responses cast rather than inferred.
5. There is no audit trail. The legacy Django system had one; this does not.
