import { useNuxtApp, useState } from '#imports'

/** The venue fields every picker in the app needs. `/api/venues` returns more. */
export interface VenueOption {
  id: string
  name: string
  capacity?: number | null
}

/**
 * The venue list, fetched once per page load and shared by every picker.
 *
 * Three modals used to call `await useFetch('/api/venues')` at their own top
 * level, and `/admin/shows` mounts all three unconditionally. That cost three
 * requests for one list.
 *
 * A shared `useFetch` key does **not** fix it. Keyed asyncData only reuses a
 * result that already exists: three components mounting in the same tick all
 * find nothing cached and all start their own request. The dedupe has to be on
 * the in-flight promise, which is what this does.
 *
 * The promise hangs off the Nuxt app instance rather than module scope, because
 * module scope on the server is shared between concurrent requests and would
 * leak one visitor's fetch into another's render.
 *
 * Client-only, deliberately. Venues are needed when a modal opens, never for the
 * first paint, so fetching during SSR would pay for a list nobody has asked to
 * see — and `await`ing one in a component suspends the whole parent tree, which
 * freezes the page and breaks close handlers (see the note at the top of
 * ShowTicketTypesModal).
 */
export function useVenues() {
  const venues = useState<VenueOption[]>('venues', () => [])
  const nuxtApp = useNuxtApp() as { _venuesRequest?: Promise<void> }

  if (import.meta.client && !nuxtApp._venuesRequest) {
    nuxtApp._venuesRequest = $fetch<VenueOption[]>('/api/venues')
      .then((rows) => { venues.value = rows })
      .catch(() => {
        // Non-fatal: the picker stays empty and the form's own "Venue is
        // required" validation stops a submit. Reopening the modal retries.
        nuxtApp._venuesRequest = undefined
      })
  }

  return { data: venues }
}
