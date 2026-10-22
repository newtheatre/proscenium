import { currentShowNight } from '#shared/utils/show-night'
import { NIGHT_VENUE_COOKIE, heldNightVenue, nightVenueChoices, nightVenueExpires, nightVenueStep } from '#shared/utils/night-venue'
import type { HeldNightVenue, NightVenueOption, NightVenueStep } from '#shared/utils/night-venue'

interface NightVenues { night: string, officer: boolean, chosenVenueId: string | null, venues: NightVenueOption[] }

// The venue this phone works tonight, held in a night-scoped cookie every show-night guard reads,
// so the hub's choice narrows each screen without each one carrying it (0230).
export function useNightVenue() {
  const request = useRequestFetch()
  const held = useCookie<HeldNightVenue | null>(NIGHT_VENUE_COOKIE, { sameSite: 'lax', expires: nightVenueExpires(currentShowNight()), default: () => null })
  const chosen = computed(() => heldNightVenue(held.value, currentShowNight()))
  const answer = ref<NightVenues | null>(null)

  const choices = computed(() => (answer.value ? nightVenueChoices(answer.value.venues, answer.value.officer) : []))
  const step = computed<NightVenueStep>(() => nightVenueStep(choices.value, chosen.value))

  // Best effort: with no answer there is nothing to choose between, and every guard still refuses.
  async function read(): Promise<NightVenues | null> {
    const read = await settleRead(() => request<NightVenues>('/api/tonight/venues'))
    return read.kind === 'READ' ? read.value : null
  }

  function apply(value: NightVenues | null): void {
    answer.value = value
  }

  // Written on the phone alone; the guards read it from the next request on.
  async function choose(venueId: string): Promise<void> {
    held.value = { night: currentShowNight(), venueId }
    await nextTick()
  }

  return { chosen, choices, step, read, apply, choose }
}
