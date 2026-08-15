import { useNuxtApp, useState } from '#imports'

/** The venue fields every picker in the app needs. `/api/venues` returns more. */
export interface VenueOption {
  id: string
  name: string
  capacity?: number | null
}

/**
 * The venue list, fetched once per page load. The dedupe is on the in-flight
 * promise, not a useFetch key, and it is client-only (ADR-0013).
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
