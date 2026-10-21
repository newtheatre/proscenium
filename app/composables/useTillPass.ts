import { computed, ref } from 'vue'
import { watchSinceMount } from '../utils/watch-since-mount'
import { refusalText } from '../utils/refusal'
import type { Ref } from 'vue'
import { newestRequest } from '#shared/utils/night-cache'
import type { PassOffer } from '#shared/utils/passes'
import type { TillSession } from '#shared/utils/till'

// A season pass sold on the till (D-134): one per sale, for the buyer whose account email is
// typed in. Held apart from the tickets pane so the basket can carry it without knowing its shape.

export interface TillPassLine {
  passTypeId: string
  passTypePriceId: string
  passName: string
  priceLabel: string
  price: number
  email: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function useTillPass(venueId: Ref<string | null>, session: Ref<TillSession | null>, performanceId: Ref<string | undefined>) {
  const passOffers = ref<PassOffer[]>([])
  const passOffersFailure = ref<string | null>(null)
  const passEmail = ref('')
  const passPriceId = ref<string | undefined>(undefined)
  const passLine = ref<TillPassLine | null>(null)
  const passPence = computed(() => passLine.value?.price ?? 0)

  const offersRead = newestRequest()
  async function loadPassOffers(): Promise<void> {
    const mine = offersRead()
    passOffers.value = []
    passOffersFailure.value = null
    if (!performanceId.value || !venueId.value || !session.value) return
    try {
      const answered = await $fetch<{ passes: PassOffer[] }>('/api/till/passes', { query: { venueId: venueId.value, performanceId: performanceId.value } })
      if (mine.newest()) passOffers.value = answered.passes
    }
    catch (refused) {
      if (mine.newest()) passOffersFailure.value = refusalText(refused)
    }
  }
  watchSinceMount([performanceId, venueId, () => session.value?.id ?? null], loadPassOffers)

  const passEmailValid = computed(() => EMAIL.test(passEmail.value.trim()))

  // The basket holds one pass at a time: a pass admits one person, and the buyer is one account.
  function addPass(): void {
    const offer = passOffers.value.find(one => one.prices.some(price => price.id === passPriceId.value))
    const price = offer?.prices.find(one => one.id === passPriceId.value)
    if (!offer || !price || !passEmailValid.value) return
    passLine.value = { passTypeId: offer.id, passTypePriceId: price.id, passName: offer.name, priceLabel: price.label, price: price.price, email: passEmail.value.trim() }
  }

  function removePass(): void {
    passLine.value = null
  }

  function resetPass(): void {
    passLine.value = null
    passEmail.value = ''
    passPriceId.value = undefined
  }

  return { passOffers, passOffersFailure, passEmail, passEmailValid, passPriceId, passLine, passPence, addPass, removePass, resetPass }
}
