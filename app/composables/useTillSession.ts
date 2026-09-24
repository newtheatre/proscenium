import { listFailureFrom } from './useListFailure'
import { deviceNightCacheStore } from './useNightCache'
import { currentShowNight } from '#shared/utils/show-night'
import { recallTillVenue, rememberTillVenue } from '#shared/utils/till'
import type { ListFailure } from './useListFailure'
import type { NightReconciliation } from '#shared/utils/reconciliation'
import type { TillSession, TillVenueOption } from '#shared/utils/till'

// The till's session lifecycle (F-102, F-118): opening, the periodic re-sync, and the close flow
// with its expected-versus-actual figure. Everything else on the screen waits on this.
export function useTillSession() {
  const request = useRequestFetch()
  const route = useRoute()
  // Optional: names which venue when more than one runs tonight, which the route already resolves
  // unaided on the (typical) night only one does. Multi-venue bars are their own story (F-202).
  const queriedVenueId = computed(() => (typeof route.query.venueId === 'string' ? route.query.venueId : undefined))
  // Failing the query, the bar this device opened tonight: the SumUp app can return in a fresh tab
  // on a bare link (issue 1257). Read on mount, since the server has no device to ask.
  const deviceVenueId = ref<string | undefined>(undefined)
  const requestedVenueId = computed(() => queriedVenueId.value ?? deviceVenueId.value)
  const syncedAt = ref<Date | null>(null)
  // Carries the enrol path a console list already reads the same way (0040, issue 897).
  const failure = ref<ListFailure | null>(null)
  const busy = ref(false)
  const session = ref<TillSession | null>(null)
  const venueId = ref<string | null>(null)
  const sumupEnabled = ref(false)

  async function load(): Promise<void> {
    busy.value = true
    failure.value = null
    let askAgain = false
    try {
      const status = await request<{ night: string, venueId: string, session: TillSession | null, sumupEnabled: boolean }>('/api/till', {
        query: { venueId: requestedVenueId.value },
      })
      session.value = status.session
      venueId.value = status.venueId
      sumupEnabled.value = status.sumupEnabled
      syncedAt.value = new Date()
      rememberTillVenue(deviceNightCacheStore(), status.night, status.venueId)
    }
    catch (refused) {
      // A remembered bar that no longer answers is dropped, and the till asks as if it had none.
      if (!queriedVenueId.value && deviceVenueId.value) {
        deviceVenueId.value = undefined
        askAgain = true
        return
      }
      failure.value = listFailureFrom(refused)
      // A recognised refusal is still a completed sync, so NightStale is not left saying "not yet
      // synced" forever (matching /tonight/index.vue's own shape).
      if (refusalStatus(refused) === 401 || refusalStatus(refused) === 403) syncedAt.value = new Date()
      // Refused at the venue just chosen: the picker comes back rather than leaving the only way
      // out in the address bar.
      if (refusalStatus(refused) === 403 && venues.value.length > 0) venueAsked.value = true
      // 400 is the guard asking which venue, so the screen answers with a picker rather than
      // leaving a volunteer to decode a refusal (F-125, 0077).
      if (refusalStatus(refused) === 400) await loadVenues()
    }
    finally {
      busy.value = false
      if (askAgain) await load()
    }
  }

  // The venues this caller may open a session at, read only when the guard asks for one. The
  // picker shows on the question rather than on the answer, so a list that fails still explains.
  const venues = ref<TillVenueOption[]>([])
  const venuesFailure = ref<string | null>(null)
  const venueAsked = ref(false)
  const needsVenue = computed(() => venueAsked.value && !session.value)

  async function loadVenues(): Promise<void> {
    venueAsked.value = true
    venuesFailure.value = null
    try {
      const answered = await request<{ venues: TillVenueOption[] }>('/api/till/venues')
      venues.value = answered.venues
      // Nobody has a bar for this caller to open, which is what the guard's own refusal says.
      if (venues.value.length === 0) venuesFailure.value = failure.value?.message ?? null
    }
    catch (refused) {
      venuesFailure.value = refusalText(refused)
    }
  }

  // Naming the venue is a reload rather than a second state to hold: the query string is what
  // every other request on the screen already reads it from.
  async function chooseVenue(chosen: string): Promise<void> {
    await navigateTo({ path: route.path, query: { ...route.query, venueId: chosen } })
    venueAsked.value = false
    await load()
  }

  async function open(): Promise<void> {
    busy.value = true
    failure.value = null
    try {
      const opened = await request<{ session: TillSession }>('/api/till', {
        method: 'POST',
        body: { venueId: requestedVenueId.value },
      })
      session.value = opened.session
      syncedAt.value = new Date()
      rememberTillVenue(deviceNightCacheStore(), opened.session.night, opened.session.venueId)
    }
    catch (refused) {
      failure.value = listFailureFrom(refused)
    }
    finally {
      busy.value = false
    }
  }

  // The expected figure before anyone commits to closing (F-102 criterion 4, F-118 criterion 3).
  const closeModalOpen = ref(false)
  const reconciliation = ref<NightReconciliation | null>(null)
  const reconciliationLoading = ref(false)
  const reconciliationFailure = ref<string | null>(null)
  const actualZPounds = ref<number | undefined>(undefined)
  const varianceNote = ref('')
  const closingBusy = ref(false)
  const closeFailure = ref<string | null>(null)

  const actualZPence = computed(() => Math.round((actualZPounds.value ?? 0) * 100))
  const variancePreviewPence = computed(() => (reconciliation.value ? actualZPence.value - reconciliation.value.bar.expectedPence : 0))

  // A note explains one variance, not a different one: it clears on either side changing, a
  // corrected Z figure or a refetched expected figure (F-118 criterion 3). The only reset.
  watch([actualZPounds, () => reconciliation.value?.bar.expectedPence], () => {
    varianceNote.value = ''
  })

  // reconciliationLoading blanks the modal, fine on the first open with nothing else to show; a
  // retry after a refusal keeps the form mounted and dims it with refreshing instead.
  const refreshing = ref(false)

  async function refreshReconciliation(showLoadingScreen = false): Promise<void> {
    if (!session.value) return
    reconciliationFailure.value = null
    refreshing.value = true
    if (showLoadingScreen) reconciliationLoading.value = true
    try {
      reconciliation.value = await request<NightReconciliation>(`/api/till/${session.value.id}/reconciliation`)
    }
    catch (refused) {
      reconciliationFailure.value = refusalText(refused)
    }
    finally {
      refreshing.value = false
      if (showLoadingScreen) reconciliationLoading.value = false
    }
  }

  async function openCloseModal(): Promise<void> {
    if (!session.value) return
    closeModalOpen.value = true
    reconciliation.value = null
    actualZPounds.value = undefined
    closeFailure.value = null
    await refreshReconciliation(true)
  }

  async function confirmClose(): Promise<void> {
    if (!session.value) return
    closingBusy.value = true
    closeFailure.value = null
    try {
      const closed = await request<{ session: TillSession }>('/api/till/close', {
        method: 'POST',
        body: {
          id: session.value.id,
          actualZPence: actualZPence.value,
          varianceNote: varianceNote.value.trim() || undefined,
        },
      })
      session.value = closed.session
      syncedAt.value = new Date()
      closeModalOpen.value = false
    }
    catch (refused) {
      closeFailure.value = refusalText(refused)
      // The server's own expected figure may have moved since the modal opened (a sale landed
      // elsewhere): refetch so the preview and the note field answer to the same figure it does.
      await refreshReconciliation()
    }
    finally {
      closingBusy.value = false
    }
  }

  onMounted(() => {
    deviceVenueId.value = recallTillVenue(deviceNightCacheStore(), currentShowNight()) ?? undefined
    return load()
  })

  return {
    requestedVenueId,
    syncedAt,
    failure,
    busy,
    session,
    venueId,
    sumupEnabled,
    venues,
    venuesFailure,
    needsVenue,
    chooseVenue,
    load,
    open,
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
