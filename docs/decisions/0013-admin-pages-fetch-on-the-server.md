# ADR-0013: Admin pages fetch on the server, with `useRequestFetch()`

**Status:** Accepted · **Date:** 2026-08-14 · **Deciders:** Matt Adcock (ITM 26/27)

## Context

Every admin endpoint is behind `authorize()`. A plain `useFetch()` running during SSR **does not
forward the incoming session cookie**, so the request arrives at the app's own API unauthenticated
and comes back 403. The symptom is a page that renders empty on a hard load and fills in only once
something triggers a client-side refetch, which looks like slowness, not like an auth failure.

The alternative (fetching lazily on the client) creates a window where the data is null. That
window is what made the `UTable` render loop reachable
([ADR-0012](0012-admin-table-conventions.md)): arriving at `/admin/ticket-types` by client-side
navigation guaranteed a null `data` with no server-rendered payload to land on.

## Decision

**Admin pages fetch on the server, passing `$fetch: useRequestFetch()`.**

```ts
const { data } = await useFetch('/api/ticket-types', { $fetch: useRequestFetch() })
```

This is not optional on any admin endpoint. It is documented at
[docs/02-architecture.md §Fetching in the admin area](../02-architecture.md).

Because admin data arrives with the page rather than after hydration, a client-side navigation waits
for the query before the new page paints. `app.vue` therefore renders a progress bar: without one,
pressing "Ticket types" reads as a dead click for as long as the query takes.

### Cache keys are not shared casually

`useFetch` keys are shared state. Two screens that ask the same endpoint different questions must not
share a key: the admin vocabulary page requests archived content warnings, and sharing its key with
the show editor would have the editor offer archived entries to be assigned to a production.

## Consequences

- Admin tables arrive populated. There is no empty-then-filled flash.
- A missing `useRequestFetch()` fails in a way that looks like a data problem rather than an auth
  problem, so it is worth checking first when an admin page renders empty on hard load.
- Data shared across components that mount in the same tick needs promise-level dedupe, not a shared
  key: keyed `asyncData` only reuses a result that already exists, and three components mounting
  together all find nothing cached and all start their own request. `useVenues()` is the worked
  example, and hangs its in-flight promise off the Nuxt app instance rather than module scope,
  because module scope on the server is shared between concurrent requests and would leak one
  visitor's fetch into another's render.
