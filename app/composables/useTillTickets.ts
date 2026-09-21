import { computed, ref, watch } from 'vue'
import { refusalText } from '../utils/refusal'
import type { Ref } from 'vue'
import { CAMERA_FALLBACK_SAYS } from '#shared/utils/door'
import type { TillBooking, WalkUpOption } from '#shared/utils/sale'
import type { ScannerFailure } from '#shared/utils/door'
import type { WalkUpLine } from './useTillBasket'

// The Tickets pane (F-122, F-123): a booking found by camera, reference or name, and a walk-up
// built from tonight's houses here. Held apart from the drinks basket, unit-testable on its own.

export function useTillTickets(venueId: Ref<string | null>) {
  const cameraOpen = ref(false)
  const cameraNote = ref<string | null>(null)
  const lookupTerm = ref('')
  const lookingUp = ref(false)
  const lookupFailure = ref<string | null>(null)
  const found = ref<TillBooking[]>([])

  function openCamera(): void {
    cameraNote.value = null
    lookupFailure.value = null
    cameraOpen.value = true
  }

  function fallBackToTyping(failure: ScannerFailure): void {
    cameraOpen.value = false
    cameraNote.value = CAMERA_FALLBACK_SAYS[failure]
  }

  async function lookUp(): Promise<void> {
    const q = lookupTerm.value.trim()
    if (q.length < 2 || !venueId.value) return
    lookingUp.value = true
    lookupFailure.value = null
    found.value = []
    try {
      const answered = await $fetch<{ bookings: TillBooking[] }>('/api/till/bookings', { query: { venueId: venueId.value, q } })
      found.value = answered.bookings
      if (found.value.length === 0) lookupFailure.value = `Nothing matching "${q}" on tonight's performances here.`
    }
    catch (refused) {
      lookupFailure.value = refusalText(refused)
    }
    finally {
      lookingUp.value = false
    }
  }

  async function scanDecoded(value: string): Promise<void> {
    if (lookingUp.value || !venueId.value) return
    cameraOpen.value = false
    lookingUp.value = true
    lookupFailure.value = null
    found.value = []
    try {
      const answered = await $fetch<{ booking: TillBooking }>('/api/till/bookings/scan', {
        method: 'POST',
        body: { venueId: venueId.value, scanned: value.trim() },
      })
      found.value = [answered.booking]
    }
    catch (refused) {
      lookupFailure.value = refusalText(refused)
    }
    finally {
      lookingUp.value = false
    }
  }

  // Bookings whose money is in the basket (F-122 criterion 2): each once, and only a pending one.
  const ticketLines = ref<TillBooking[]>([])
  const ticketsPence = computed(() => ticketLines.value.reduce((sum, booking) => sum + booking.owedPence, 0))

  function addBooking(booking: TillBooking): void {
    if (booking.refusal || ticketLines.value.some(line => line.id === booking.id)) return
    ticketLines.value.push(booking)
    found.value = []
    lookupTerm.value = ''
  }

  function removeBooking(id: string): void {
    ticketLines.value = ticketLines.value.filter(line => line.id !== id)
  }

  // A walk-up (F-123): one of tonight's houses here, a type at a quantity, and an optional guest.
  const authority = useNightAuthority()
  const walkUpPerformanceId = ref<string | undefined>(undefined)
  const walkUpOptions = ref<WalkUpOption[]>([])
  const walkUpOptionsFailure = ref<string | null>(null)
  const walkUpQty = ref<Record<string, number>>({})
  const walkUpGuestName = ref('')
  const walkUpGuestEmail = ref('')

  const walkUpLines = ref<WalkUpLine[]>([])
  const walkUpsPence = computed(() => walkUpLines.value.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0))

  const tonightsPerformances = computed(() => authority.value.performances)
  watch(tonightsPerformances, (performances) => {
    if (!walkUpPerformanceId.value && performances.length === 1) walkUpPerformanceId.value = performances[0]!.id
  }, { immediate: true })

  watch(walkUpPerformanceId, async (performanceId) => {
    walkUpOptions.value = []
    walkUpQty.value = {}
    walkUpOptionsFailure.value = null
    if (!performanceId || !venueId.value) return
    try {
      const answered = await $fetch<{ options: WalkUpOption[] }>('/api/till/walk-up-options', { query: { venueId: venueId.value, performanceId } })
      walkUpOptions.value = answered.options
    }
    catch (refused) {
      walkUpOptionsFailure.value = refusalText(refused)
    }
  })

  function bumpWalkUp(typeId: string, by: number): void {
    walkUpQty.value[typeId] = Math.max(0, Math.min(20, (walkUpQty.value[typeId] ?? 0) + by))
  }

  function addWalkUps(): void {
    const performance = tonightsPerformances.value.find(one => one.id === walkUpPerformanceId.value)
    if (!performance) return
    for (const option of walkUpOptions.value) {
      const quantity = walkUpQty.value[option.id] ?? 0
      if (quantity === 0) continue
      const existing = walkUpLines.value.find(line => line.performanceId === performance.id && line.ticketTypeId === option.id)
      if (existing) existing.quantity = Math.min(20, existing.quantity + quantity)
      else walkUpLines.value.push({ performanceId: performance.id, showTitle: performance.showTitle, ticketTypeId: option.id, typeName: option.name, quantity, unitPrice: option.price })
    }
    walkUpQty.value = {}
  }

  function removeWalkUp(line: WalkUpLine): void {
    walkUpLines.value = walkUpLines.value.filter(entry => entry !== line)
  }

  const walkUpGuest = computed(() => {
    const name = walkUpGuestName.value.trim()
    const email = walkUpGuestEmail.value.trim()
    return name && email ? { name, email } : null
  })
  const walkUpGuestIncomplete = computed(() => Boolean(walkUpGuestName.value.trim()) !== Boolean(walkUpGuestEmail.value.trim()))

  function resetTickets(): void {
    ticketLines.value = []
    walkUpLines.value = []
    walkUpGuestName.value = ''
    walkUpGuestEmail.value = ''
    found.value = []
    lookupTerm.value = ''
  }

  return {
    cameraOpen,
    cameraNote,
    lookupTerm,
    lookingUp,
    lookupFailure,
    found,
    openCamera,
    fallBackToTyping,
    lookUp,
    scanDecoded,
    ticketLines,
    ticketsPence,
    addBooking,
    removeBooking,
    walkUpPerformanceId,
    walkUpOptions,
    walkUpOptionsFailure,
    walkUpQty,
    walkUpGuestName,
    walkUpGuestEmail,
    walkUpLines,
    walkUpsPence,
    tonightsPerformances,
    bumpWalkUp,
    addWalkUps,
    removeWalkUp,
    walkUpGuest,
    walkUpGuestIncomplete,
    resetTickets,
  }
}
