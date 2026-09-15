import type { NightReconciliation } from '#shared/utils/reconciliation'
import type { TillSession } from '#shared/utils/till'

// The till's session lifecycle (F-102, F-118): opening, the periodic re-sync, and the close flow
// with its expected-versus-actual figure. Everything else on the screen waits on this.
export function useTillSession() {
  const request = useRequestFetch()
  const route = useRoute()
  // Optional: names which venue when more than one runs tonight, which the route already resolves
  // unaided on the (typical) night only one does. Multi-venue bars are their own story (F-202).
  const requestedVenueId = computed(() => (typeof route.query.venueId === 'string' ? route.query.venueId : undefined))
  const syncedAt = ref<Date | null>(null)
  const failure = ref<string | null>(null)
  const busy = ref(false)
  const session = ref<TillSession | null>(null)
  const venueId = ref<string | null>(null)
  const sumupEnabled = ref(false)

  async function load(): Promise<void> {
    busy.value = true
    failure.value = null
    try {
      const status = await request<{ night: string, venueId: string, session: TillSession | null, sumupEnabled: boolean }>('/api/till', {
        query: { venueId: requestedVenueId.value },
      })
      session.value = status.session
      venueId.value = status.venueId
      sumupEnabled.value = status.sumupEnabled
      syncedAt.value = new Date()
    }
    catch (refused) {
      failure.value = refusalText(refused)
      // A recognised refusal is still a completed sync, so NightStale is not left saying "not yet
      // synced" forever (matching /tonight/index.vue's own shape).
      if (refusalStatus(refused) === 401 || refusalStatus(refused) === 403) syncedAt.value = new Date()
    }
    finally {
      busy.value = false
    }
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
    }
    catch (refused) {
      failure.value = refusalText(refused)
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

  onMounted(load)

  return {
    requestedVenueId,
    syncedAt,
    failure,
    busy,
    session,
    venueId,
    sumupEnabled,
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
