import { listFailureFrom } from './useListFailure'
import { deviceNightCacheStore } from './useNightCache'
import { closeVariancePence } from '#shared/utils/reconciliation'
import { currentShowNight } from '#shared/utils/show-night'
import { TILL_VENUE_COOKIE, TILL_VENUE_DEVICE_KEY, heldTillVenue, recallTillVenue, tillRefusalStep, tillVenueExpires } from '#shared/utils/till'
import type { ListFailure } from './useListFailure'
import type { SettledRead } from '~/utils/refusal'
import type { NightReconciliation } from '#shared/utils/reconciliation'
import type { HeldTillVenue, TillSession, TillVenueOption } from '#shared/utils/till'

export interface TillStatus { night: string, venueId: string, session: TillSession | null, sumupEnabled: boolean }

export interface TillRead {
  // Settled keeping the enrol path a refusal carries (issue 897).
  status: SettledRead<TillStatus, ListFailure>
  // Whether the answer came from the bar this device remembers, or that bar was refused and is dropped.
  device: 'UNUSED' | 'USED' | 'FORGOTTEN'
  venues: SettledRead<{ venues: TillVenueOption[] }> | null
}

// The till's session lifecycle (F-102, F-118): opening, the periodic re-sync, and the close flow
// with its expected-versus-actual figure. Everything else on the screen waits on this.
export function useTillSession() {
  const request = useRequestFetch()
  const route = useRoute()
  // Optional: names which venue when more than one runs tonight, which the route already resolves
  // unaided on the (typical) night only one does. Multi-venue bars are their own story (F-202).
  const queriedVenueId = computed(() => (typeof route.query.venueId === 'string' ? route.query.venueId : undefined))
  // The bar this device opened tonight, in a night-scoped cookie the server reads too, answers the
  // guard's "which bar?" so the SumUp app's return on a bare link does not ask again (issue 1257).
  const held = useCookie<HeldTillVenue | null>(TILL_VENUE_COOKIE, { sameSite: 'lax', expires: tillVenueExpires(currentShowNight()), default: () => null })
  const rememberedVenueId = computed(() => heldTillVenue(held.value, currentShowNight()))
  const usingDevice = ref(false)
  const requestedVenueId = computed(() => queriedVenueId.value ?? (usingDevice.value ? rememberedVenueId.value ?? undefined : undefined))
  const syncedAt = ref<number | null>(null)
  // Carries the enrol path a console list already reads the same way (0040, issue 897).
  const failure = ref<ListFailure | null>(null)
  // A 403 alone draws the refusal card in place of the till (issue 1304); anything else is a line.
  const failureStatus = ref<number | null>(null)
  const busy = ref(false)
  const session = ref<TillSession | null>(null)
  const venueId = ref<string | null>(null)
  const sumupEnabled = ref(false)
  // Whether the screen has an answer to draw: until then, on a navigation, neither Open till nor a picker.
  const settled = ref(false)

  // Written on the phone alone, where the till opened or the bar was picked.
  function remember(night: string, venue: string): void {
    if (import.meta.client) held.value = { night, venueId: venue }
  }

  function forgetDeviceVenue(): void {
    usingDevice.value = false
    if (import.meta.client) held.value = null
  }

  function askTill(venue: string | undefined): Promise<SettledRead<TillStatus, ListFailure>> {
    return settleReadWith(() => request<TillStatus>('/api/till', { query: { venueId: venue } }), listFailureFrom)
  }

  // Asked unaided first, so a night the server resolves opens where it says; the remembered bar
  // answers only the guard's own question, and the venues ride along wherever the picker is the answer.
  async function read(): Promise<TillRead> {
    const queried = queriedVenueId.value
    const remembered = rememberedVenueId.value
    let status = await askTill(queried)
    let device: TillRead['device'] = 'UNUSED'
    if (status.kind === 'FAILED' && tillRefusalStep(status.status, { queried, remembered, usingDevice: false }) === 'ASK_WITH_DEVICE') {
      const viaDevice = await askTill(remembered ?? undefined)
      if (viaDevice.kind === 'READ') {
        status = viaDevice
        device = 'USED'
      }
      else if (tillRefusalStep(viaDevice.status, { queried, remembered, usingDevice: true }) === 'FORGET_DEVICE') {
        device = 'FORGOTTEN'
      }
    }
    const asksWhichBar = status.kind === 'FAILED' && status.status === 400
    const venuesRead = asksWhichBar ? await settleRead(() => request<{ venues: TillVenueOption[] }>('/api/till/venues')) : null
    return { status, device, venues: venuesRead }
  }

  function settle(answered: TillRead): void {
    if (answered.device === 'FORGOTTEN') forgetDeviceVenue()
    usingDevice.value = answered.device === 'USED'
    const { status } = answered
    settled.value = true
    if (status.kind === 'READ') {
      session.value = status.value.session
      venueId.value = status.value.venueId
      sumupEnabled.value = status.value.sumupEnabled
      syncedAt.value = status.at
      if (queriedVenueId.value) remember(status.value.night, status.value.venueId)
      return
    }
    failure.value = status.failure
    failureStatus.value = status.status ?? null
    // A recognised refusal is still a completed sync, so NightStale is not left saying "not yet
    // synced" forever (matching /tonight/index.vue's own shape).
    if (status.status === 401 || status.status === 403) syncedAt.value = status.at
    // Refused at the venue just chosen: the picker comes back rather than leaving the only way
    // out in the address bar.
    if (status.status === 403 && venues.value.length > 0) venueAsked.value = true
    // 400 is the guard asking which venue, so the screen answers with a picker rather than
    // leaving a volunteer to decode a refusal (F-125, 0077).
    if (status.status === 400 && answered.venues) {
      venueAsked.value = true
      applyVenues(answered.venues)
    }
  }

  async function whileBusy(work: () => Promise<void>): Promise<void> {
    busy.value = true
    try {
      await work()
    }
    finally {
      busy.value = false
    }
  }

  function load(): Promise<void> {
    failure.value = null
    failureStatus.value = null
    return whileBusy(async () => settle(await read()))
  }

  // The way out of a remembered bar: the picker, exactly as if the device had never chosen.
  async function changeVenue(): Promise<void> {
    forgetDeviceVenue()
    session.value = null
    await loadVenues()
  }

  // The venues this caller may open a session at, read only when the guard asks for one. The
  // picker shows on the question rather than on the answer, so a list that fails still explains.
  const venues = ref<TillVenueOption[]>([])
  const venuesFailure = ref<string | null>(null)
  const venueAsked = ref(false)
  const needsVenue = computed(() => venueAsked.value && !session.value)

  function applyVenues(answered: SettledRead<{ venues: TillVenueOption[] }>): void {
    if (answered.kind === 'FAILED') {
      venuesFailure.value = answered.failure
      return
    }
    venues.value = answered.value.venues
    // Nobody has a bar for this caller to open, which is what the guard's own refusal says.
    venuesFailure.value = venues.value.length === 0 ? (failure.value?.message ?? null) : null
  }

  async function loadVenues(): Promise<void> {
    venueAsked.value = true
    venuesFailure.value = null
    applyVenues(await settleRead(() => request<{ venues: TillVenueOption[] }>('/api/till/venues')))
  }

  // Naming the venue is a reload rather than a second state to hold: the query string is what
  // every other request on the screen already reads it from.
  async function chooseVenue(chosen: string): Promise<void> {
    await navigateTo({ path: route.path, query: { ...route.query, venueId: chosen } })
    venueAsked.value = false
    await load()
  }

  function open(): Promise<void> {
    failure.value = null
    failureStatus.value = null
    return whileBusy(async () => {
      try {
        const opened = await request<{ session: TillSession }>('/api/till', {
          method: 'POST',
          body: { venueId: requestedVenueId.value },
        })
        session.value = opened.session
        syncedAt.value = Date.now()
        remember(opened.session.night, opened.session.venueId)
      }
      catch (refused) {
        failure.value = listFailureFrom(refused)
        failureStatus.value = refusalStatus(refused) ?? null
      }
    })
  }

  // The expected figure before anyone commits to closing (F-102 criterion 4, F-118 criterion 3).
  // Tonight's session, or one an ended night left open that the Front of House Manager chose (issue 1316).
  const closing = ref<{ id: string, venueName: string, night: string } | null>(null)
  const closeModalOpen = ref(false)
  const reconciliation = ref<NightReconciliation | null>(null)
  const reconciliationLoading = ref(false)
  const reconciliationFailure = ref<string | null>(null)
  const actualZPounds = ref<number | undefined>(undefined)
  const varianceNote = ref('')
  const closingBusy = ref(false)
  const closeFailure = ref<string | null>(null)

  const actualZPence = computed(() => Math.round((actualZPounds.value ?? 0) * 100))
  const variancePreviewPence = computed(() => (reconciliation.value ? closeVariancePence(reconciliation.value, actualZPence.value) : 0))

  // A note explains one variance, not a different one: it clears on either side changing, a
  // corrected Z figure or a refetched expected figure (F-118 criterion 3). The only reset.
  watch([actualZPounds, () => reconciliation.value?.wholeNightExpectedPence], () => {
    varianceNote.value = ''
  })

  // reconciliationLoading blanks the modal, fine on the first open with nothing else to show; a
  // retry after a refusal keeps the form mounted and dims it with refreshing instead.
  const refreshing = ref(false)

  const closingId = computed(() => closing.value?.id ?? session.value?.id ?? null)

  async function refreshReconciliation(showLoadingScreen = false): Promise<void> {
    if (!closingId.value) return
    reconciliationFailure.value = null
    refreshing.value = true
    if (showLoadingScreen) reconciliationLoading.value = true
    try {
      reconciliation.value = await request<NightReconciliation>(`/api/till/${closingId.value}/reconciliation`)
    }
    catch (refused) {
      reconciliationFailure.value = refusalText(refused)
    }
    finally {
      refreshing.value = false
      if (showLoadingScreen) reconciliationLoading.value = false
    }
  }

  async function openCloseModal(earlier: { id: string, venueName: string, night: string } | null = null): Promise<void> {
    closing.value = earlier
    if (!closingId.value) return
    closeModalOpen.value = true
    reconciliation.value = null
    actualZPounds.value = undefined
    closeFailure.value = null
    await refreshReconciliation(true)
  }

  // Resolves to the session it closed, so the screen can drop an earlier one from its list.
  async function confirmClose(): Promise<TillSession | null> {
    if (!closingId.value) return null
    closingBusy.value = true
    closeFailure.value = null
    try {
      const closed = await request<{ session: TillSession }>('/api/till/close', {
        method: 'POST',
        body: {
          id: closingId.value,
          actualZPence: actualZPence.value,
          varianceNote: varianceNote.value.trim() || undefined,
        },
      })
      if (closed.session.id === session.value?.id) session.value = closed.session
      syncedAt.value = Date.now()
      closeModalOpen.value = false
      return closed.session
    }
    catch (refused) {
      closeFailure.value = refusalText(refused)
      // The server's own expected figure may have moved since the modal opened (a sale landed
      // elsewhere): refetch so the preview and the note field answer to the same figure it does.
      await refreshReconciliation()
      return null
    }
    finally {
      closingBusy.value = false
    }
  }

  // An earlier build kept the bar in the device store: carried over once to the cookie, and asked
  // again with it where the till is asking which bar.
  onMounted(() => {
    const store = deviceNightCacheStore()
    const legacy = recallTillVenue(store, currentShowNight())
    try {
      store.removeItem(TILL_VENUE_DEVICE_KEY)
    }
    catch { /* a device that refuses its store has nothing to carry over */ }
    if (!legacy || rememberedVenueId.value) return
    held.value = { night: currentShowNight(), venueId: legacy }
    if (needsVenue.value && !queriedVenueId.value) void load()
  })

  return {
    requestedVenueId,
    usingDevice,
    changeVenue,
    syncedAt,
    failure,
    failureStatus,
    busy,
    settled,
    session,
    venueId,
    sumupEnabled,
    venues,
    venuesFailure,
    needsVenue,
    chooseVenue,
    read,
    settle,
    load,
    open,
    closing,
    closeModalOpen,
    reconciliation,
    reconciliationLoading,
    reconciliationFailure,
    refreshing,
    actualZPounds,
    varianceNote,
    closingBusy,
    closeFailure,
    actualZPence,
    variancePreviewPence,
    openCloseModal,
    confirmClose,
  }
}
