// The emergency cards kept on this device, so a card opens with no signal even if never opened before.
// A practice tab keeps its own, which leaving practice forgets, so a practice card never shows for real.
const KEPT = 'proscenium:front-of-house:emergency-cards'
const PRACTICE_KEPT = 'proscenium:practice:front-of-house:emergency-cards'

export interface EmergencyCard { venueId: string, venueName: string, body: string, reviewedOn: string, updatedAt: number }

export function useKeptCards() {
  const { $api } = useNuxtApp()
  const { practising } = usePractising()
  const key = () => (practising.value ? PRACTICE_KEPT : KEPT)
  function read(): EmergencyCard[] {
    try {
      return JSON.parse(localStorage.getItem(key()) ?? '[]') as EmergencyCard[]
    }
    catch {
      return []
    }
  }
  function keep(cards: EmergencyCard[]) {
    try {
      localStorage.setItem(key(), JSON.stringify(cards))
    }
    catch {
      // A full or blocked store only means the card is not kept for next time.
    }
  }
  // Fetches every card quietly; a failure leaves whatever copy is already kept.
  async function fetchAhead() {
    try {
      keep((await $api<{ cards: EmergencyCard[] }>('/api/front-of-house/emergency-cards')).cards)
    }
    catch {
      // Offline or refused: the kept copy stands.
    }
  }
  return { read, keep, fetchAhead }
}
