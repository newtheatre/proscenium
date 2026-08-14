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
 * The dedupe is on the in-flight promise, not a `useFetch` key: keyed
 * asyncData only reuses a result that already exists, so three modals mounting
 * in the same tick all find nothing cached and all fetch (ADR-0013). The
 * promise hangs off the Nuxt app instance rather than module scope, which on
 * the server is shared between concurrent requests.
 *
 * Client-only: venues are needed when a modal opens, never for first paint,
 * and awaiting one in a component suspends the whole parent tree.
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
