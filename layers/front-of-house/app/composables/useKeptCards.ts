// The emergency cards kept on this device, so a card opens with no signal even if never opened before.
const KEPT = 'proscenium:front-of-house:emergency-cards'

export interface EmergencyCard { venueId: string, venueName: string, body: string, reviewedOn: string, updatedAt: number }

export function useKeptCards() {
  const { $api } = useNuxtApp()
  function read(): EmergencyCard[] {
    try {
      return JSON.parse(localStorage.getItem(KEPT) ?? '[]') as EmergencyCard[]
    }
    catch {
      return []
    }
  }
  function keep(cards: EmergencyCard[]) {
    try {
      localStorage.setItem(KEPT, JSON.stringify(cards))
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
