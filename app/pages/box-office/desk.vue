<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { DESK_CASH_SAYS, DESK_STATUS_FILTERS, DESK_STATUS_LABELS, DESK_TENDERS, REINSTATE_REASON_LIMIT, compBlockedSays, deskEmptySays, deskFigures, deskOpeningPerformanceId, otherPerformanceSays, reinstateRefusal, saysDeskStatus, saysDeskNight, saysBooker, uncollectableReason, unpaidReleaseSays, walkUpLineMax, walkUpRefusal, walkUpTotalPence } from '#shared/utils/desk'
import { CAMERA_FALLBACK_SAYS } from '#shared/utils/door'
import { nothingToCollect, passCollectReason } from '#shared/utils/reservations'
import { isShowNight } from '#shared/utils/show-night'
import { saysClock, saysWhen } from '#shared/utils/when'
import { saysPrice } from '#shared/utils/ticket-types'
import type { DeskHouse, DeskStatusFilter, DeskTender } from '#shared/utils/desk'
import { EXISTING_ACCOUNT_SAYS } from '#shared/utils/sale'
import type { WalkUpOption } from '#shared/utils/sale'
import type { ScannerFailure } from '~/composables/useQrScanner'
import type { TableColumn } from '@nuxt/ui'

// Comp authority is the request and its approval now, not a permission the desk screen checks
// itself (D-117): every tender is always offered, and the route is what actually decides.
const tenderOptions = [...DESK_TENDERS]

definePageMeta({ layout: 'console', title: 'Desk', middleware: 'console', docs: '/docs/box-office/desk' })

interface DeskPerformance {
  id: string
  showTitle: string
  venueName: string
  startsAt: number
}

interface Nightly {
  night: string
  tonight: string
  // The nearest night either side with a performance on it, or null with none that way.
  previousNight: string | null
  nextNight: string | null
  performances: DeskPerformance[]
}

interface SearchRow {
  id: string
  reference: string
  status: string
  bookerName: string | null
  totalPence: number
  holdExpiresAt: number | null
}

interface TicketLine {
  ticketId: string
  ticketTypeName: string
  pricePaid: number
  accessKind: 'ACCESS' | 'COMPANION' | null
}

interface ReservationCompRequest {
  id: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED'
  expired: boolean
  declineReason: string | null
  decidedByName: string | null
}

interface ReservationDetail {
  id: string
  reference: string
  status: string
  // Null except on a cancelled booking: a staff cancellation only ever follows a refund, and
  // that is what decides whether this screen may offer to bring the hold back (D-118).
  cancelledBy: string | null
  holdExpiresAt: number | null
  performanceId: string
  showTitle: string
  startsAt: number
  bookerName: string | null
  bookerEmail: string | null
  tickets: TicketLine[]
  refundedTickets: TicketLine[]
  doorWording: string | null
  compRequest: ReservationCompRequest | null
}

interface DeskSummary extends DeskHouse {
  accessBookings: number
  passAdmissions: number
  reservationsReleaseAt: number
  onShift: string[]
}

const request = useRequestFetch()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const queried = (key: string): string | null => (typeof route.query[key] === 'string' && route.query[key] !== '' ? route.query[key] as string : null)
// The night and the performance live in the address, so a refresh or a shared link opens on them.
const night = ref<string | null>(queried('night') !== null && isShowNight(queried('night')!) ? queried('night') : null)
const performanceId = ref<string | undefined>(queried('performance') ?? undefined)
const q = ref('')
const statusFilter = ref<DeskStatusFilter>('ALL')
const scanned = ref('')
const scanning = ref(false)
// The camera is mounted only while open, so closing it is what stops the lens (criterion 8).
const cameraOpen = ref(false)
const cameraNote = ref<string | null>(null)
const searchFailure = ref<string | null>(null)
const scanFailure = ref<string | null>(null)

const summary = ref<DeskSummary | null>(null)
const summaryFailure = ref<string | null>(null)

async function loadSummary(): Promise<void> {
  if (!performanceId.value) {
    summary.value = null
    return
  }
  summaryFailure.value = null
  try {
    summary.value = await $fetch<DeskSummary>('/api/box-office/desk/summary', { query: { performanceId: performanceId.value } })
  }
  catch (error) {
    summaryFailure.value = refusalText(error)
  }
}

const releaseTime = computed(() => (summary.value ? saysClock(summary.value.reservationsReleaseAt) : null))
// Ticks so the unpaid notice turns over at the release without a reload.
const nowSeconds = ref(Math.floor(Date.now() / 1000))
let ticking: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  ticking = setInterval(() => (nowSeconds.value = Math.floor(Date.now() / 1000)), 30_000)
})
onBeforeUnmount(() => clearInterval(ticking))
const unpaidSays = computed(() => (summary.value ? unpaidReleaseSays(summary.value.reservationsReleaseAt, nowSeconds.value) : ''))

const summaryTiles = computed(() => (summary.value ? deskFigures(summary.value) : []))

const { data: nightly, refresh: refreshNightly, error: nightlyError } = await useAsyncData<Nightly>(
  'desk-nightly',
  () => request('/api/box-office/desk/performances', { query: night.value ? { night: night.value } : {} }),
  { watch: [night] },
)

// The failure is shown rather than left to a silent "no results", since a fetch a shift opens on
// can refuse for reasons the empty state cannot say.
const nightlyFailure = useListFailure(nightlyError, 'Tonight could not be read.')

watch(nightly, (value) => {
  if (!value) return
  if (!performanceId.value || !value.performances.some(one => one.id === performanceId.value)) {
    performanceId.value = deskOpeningPerformanceId(value.performances, value.night === value.tonight, Math.floor(Date.now() / 1000))
  }
}, { immediate: true })

function goTo(target: string | null): void {
  if (!target) return
  night.value = target
  performanceId.value = undefined
}

const pickedNight = computed({
  get: (): string | undefined => nightly.value?.night,
  set: (value: string | undefined) => goTo(value ?? null),
})

watch([night, performanceId], ([onNight, onPerformance]) => {
  void router.replace({ query: { ...route.query, night: onNight ?? undefined, performance: onPerformance ?? undefined } })
})

const walkUpOptions = ref<WalkUpOption[]>([])
const walkUpQuantities = ref<Record<string, number>>({})
const walkUpGuest = ref({ name: '', email: '', existingAccount: false })
const walkUpOptionsFailure = ref<string | null>(null)
const walkUpFailure = ref<string | null>(null)
const selling = ref(false)

async function loadWalkUpOptions(): Promise<void> {
  walkUpOptions.value = []
  walkUpQuantities.value = {}
  walkUpOptionsFailure.value = null
  if (!performanceId.value) return
  try {
    const body = await $fetch<{ options: WalkUpOption[] }>('/api/box-office/desk/ticket-types', { query: { performanceId: performanceId.value } })
    walkUpOptions.value = body.options
    walkUpQuantities.value = Object.fromEntries(body.options.map(option => [option.id, 0]))
  }
  catch (error) {
    walkUpOptionsFailure.value = refusalText(error)
  }
}

const walkUpLines = computed(() => walkUpOptions.value.map(option => ({
  ticketTypeId: option.id,
  pricePence: option.price,
  quantity: walkUpQuantities.value[option.id] ?? 0,
})))
const walkUpTotal = computed(() => walkUpTotalPence(walkUpLines.value))
// The house on screen bounds what the steppers offer; the route's capacity predicate still decides.
const seatsLeft = computed(() => (summary.value && summary.value.capacity !== null ? Math.max(0, summary.value.capacity - summary.value.sold) : null))
const walkUpBlockedSays = computed(() => walkUpRefusal(walkUpLines.value, walkUpGuest.value, seatsLeft.value))
const walkUpChosen = computed(() => walkUpLines.value.reduce((total, line) => total + line.quantity, 0))
const lineMax = (typeId: string): number => walkUpLineMax(seatsLeft.value, walkUpChosen.value - (walkUpQuantities.value[typeId] ?? 0))
// Offered only once the route has said the address is held in another name (0123).
const askExistingAccount = computed(() => walkUpFailure.value === EXISTING_ACCOUNT_SAYS || walkUpGuest.value.existingAccount)

// D-115 criterion 7: the sale and its payment are one write, and the figure on screen is the
// figure sent, so a reader keyed to something else is refused before anything is created (0005).
async function takeWalkUp(): Promise<void> {
  if (!performanceId.value || walkUpBlockedSays.value !== null) return
  selling.value = true
  walkUpFailure.value = null
  try {
    const sold = await $fetch<{ reference: string }>('/api/box-office/desk/reservations', {
      method: 'POST',
      body: {
        performanceId: performanceId.value,
        lines: walkUpLines.value.filter(line => line.quantity > 0).map(line => ({ ticketTypeId: line.ticketTypeId, quantity: line.quantity })),
        guest: walkUpGuest.value.name.trim() || walkUpGuest.value.email.trim()
          ? { name: walkUpGuest.value.name.trim(), email: walkUpGuest.value.email.trim(), existingAccount: walkUpGuest.value.existingAccount }
          : null,
        expectedTotalPence: walkUpTotal.value,
        tender: 'CARD',
      },
    })
    toast.add({ title: 'Walk-up sold', description: `Reference ${sold.reference}.`, icon: 'i-lucide-check', color: 'success' })
    walkUpQuantities.value = Object.fromEntries(walkUpOptions.value.map(option => [option.id, 0]))
    walkUpGuest.value = { name: '', email: '', existingAccount: false }
    await search()
    void loadSummary()
  }
  catch (error) {
    walkUpFailure.value = refusalText(error)
  }
  finally {
    selling.value = false
  }
}

const results = ref<SearchRow[]>([])
const searching = ref(false)
const searched = ref(false)
const narrowed = ref(false)
// What the last search was for, said beside the pills, which filter within it (process map, 21 Oct).
const searchedFor = ref('')

function clearSearch(): void {
  q.value = ''
  void search()
}

// What the empty card says depends on whether a search has run and whether anything narrowed it:
// the card searches on its own, so "no results yet" was said about a search that had happened.
const emptySays = computed(() => deskEmptySays({ searched: searched.value, narrowed: narrowed.value }))

async function search(): Promise<void> {
  if (!performanceId.value) return
  searching.value = true
  searchFailure.value = null
  const asked = q.value.trim()
  try {
    const page = await $fetch<{ items: SearchRow[] }>('/api/box-office/desk/search', {
      query: { performanceId: performanceId.value, q: asked || undefined, status: statusFilter.value },
    })
    results.value = page.items
    searchedFor.value = asked
    narrowed.value = asked.length > 0 || statusFilter.value !== 'ALL'
    searched.value = true
  }
  catch (error) {
    searchFailure.value = refusalText(error)
  }
  finally {
    searching.value = false
  }
}

// Immediate, since the nightly watcher above may already have set performanceId synchronously
// ahead of this one registering, and a shift that opens the desk fresh still wants tonight's list.
watch(performanceId, () => {
  results.value = []
  searched.value = false
  narrowed.value = false
  q.value = ''
  searchedFor.value = ''
  statusFilter.value = 'ALL'
  void search()
  void loadSummary()
  void loadWalkUpOptions()
}, { immediate: true })

watch(statusFilter, () => void search())

const selected = ref<ReservationDetail | null>(null)
const open = ref(false)
const openingId = ref<string | null>(null)
const tender = ref<DeskTender>('CARD')
const compRequestReason = ref('')
const requestingComp = ref(false)
const compRequestFailure = ref<string | null>(null)
const collecting = ref(false)
const collectFailure = ref<string | null>(null)

const reinstateReason = ref('')
const reinstating = ref(false)
const reinstateFailure = ref<string | null>(null)

const uncollectableSays = computed(() => (selected.value ? uncollectableReason(selected.value.status, selected.value.cancelledBy) : null))
// The route refuses again on its own and re-checks capacity at the write: this only decides
// whether the desk offers the form at all (D-118 criteria 1, 5).
const reinstateSays = computed(() => (selected.value ? reinstateRefusal(selected.value.status, selected.value.cancelledBy) : null))

async function reinstate(): Promise<void> {
  if (!selected.value || !reinstateReason.value.trim()) return
  reinstating.value = true
  reinstateFailure.value = null
  try {
    await $fetch(`/api/box-office/desk/reservations/${selected.value.id}/reinstate`, {
      method: 'POST',
      body: { reason: reinstateReason.value.trim() },
    })
    toast.add({ title: 'Booking reinstated', description: 'It holds again until the release time.', icon: 'i-lucide-check', color: 'success' })
    reinstateReason.value = ''
    selected.value = await $fetch<ReservationDetail>(`/api/box-office/desk/reservations/${selected.value.id}`)
    await search()
    void loadSummary()
  }
  catch (error) {
    reinstateFailure.value = refusalText(error)
  }
  finally {
    reinstating.value = false
  }
}

const ticketTotalPence = computed(() => selected.value?.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0) ?? 0)
const passBookingSays = computed(() => (selected.value?.status === 'PENDING'
  ? passCollectReason(selected.value.holdExpiresAt, ticketTotalPence.value)
  : null))
const dueNow = computed(() => (tender.value === 'COMP' ? 0 : ticketTotalPence.value))
// D-117: only an approved, unexpired, unspent request lets a comp be collected.
const compApproved = computed(() => selected.value?.compRequest?.status === 'APPROVED' && !selected.value.compRequest.expired)
// One sentence for why Collect is closed, said once on screen and named by the button itself, so
// the reason never sits behind a control with nothing beside it (D-114 criterion 9).
const collectBlockedSays = computed(() => (tender.value === 'COMP' ? compBlockedSays(selected.value?.compRequest ?? null) : null))

function resetBookingForm(): void {
  collectFailure.value = null
  tender.value = 'CARD'
  compRequestReason.value = ''
  compRequestFailure.value = null
  reinstateReason.value = ''
  reinstateFailure.value = null
}

// A refusal here is the row's own: the results stay put and say so, rather than the press doing
// nothing at all while the read fails silently.
async function openReservation(id: string): Promise<void> {
  if (openingId.value) return
  openingId.value = id
  searchFailure.value = null
  resetBookingForm()
  try {
    selected.value = await $fetch<ReservationDetail>(`/api/box-office/desk/reservations/${id}`)
    open.value = true
  }
  catch (error) {
    searchFailure.value = refusalText(error)
  }
  finally {
    openingId.value = null
  }
}

// One path for the camera and the typed field both: the route reads every form a code takes,
// so nothing here decides what a value means (criterion 8).
async function resolveScan(raw: string): Promise<void> {
  scanning.value = true
  scanFailure.value = null
  try {
    selected.value = await $fetch<ReservationDetail>('/api/box-office/desk/scan', {
      method: 'POST',
      body: { scanned: raw },
    })
    resetBookingForm()
    open.value = true
    scanned.value = ''
  }
  catch (error) {
    scanFailure.value = refusalText(error)
  }
  finally {
    scanning.value = false
  }
}

async function scan(): Promise<void> {
  if (!scanned.value.trim() || scanning.value) return
  await resolveScan(scanned.value.trim())
}

async function scanDecoded(value: string): Promise<void> {
  if (scanning.value) return
  cameraOpen.value = false
  await resolveScan(value.trim())
}

function fallBackToTyping(failure: ScannerFailure): void {
  cameraOpen.value = false
  cameraNote.value = CAMERA_FALLBACK_SAYS[failure]
}

function openCamera(): void {
  cameraNote.value = null
  scanFailure.value = null
  cameraOpen.value = true
}

async function requestComp(): Promise<void> {
  if (!selected.value || !compRequestReason.value.trim()) return
  requestingComp.value = true
  compRequestFailure.value = null
  try {
    await $fetch('/api/box-office/desk/comp-requests', {
      method: 'POST',
      body: { reservationId: selected.value.id, reason: compRequestReason.value.trim() },
    })
    selected.value = await $fetch<ReservationDetail>(`/api/box-office/desk/reservations/${selected.value.id}`)
    toast.add({ title: 'Comp requested', description: 'Waiting on tonight\'s duty manager.', icon: 'i-lucide-clock', color: 'info' })
  }
  catch (error) {
    compRequestFailure.value = refusalText(error)
  }
  finally {
    requestingComp.value = false
  }
}

async function collect(): Promise<void> {
  if (!selected.value) return
  collecting.value = true
  collectFailure.value = null
  try {
    await $fetch(`/api/box-office/desk/reservations/${selected.value.id}/collect`, {
      method: 'POST',
      body: {
        expectedTotalPence: dueNow.value,
        tender: tender.value,
        compRequestId: tender.value === 'COMP' ? selected.value.compRequest?.id : undefined,
      },
    })
    toast.add({ title: 'Booking collected', icon: 'i-lucide-check', color: 'success' })
    open.value = false
    await search()
    void loadSummary()
  }
  catch (error) {
    collectFailure.value = refusalText(error)
  }
  finally {
    collecting.value = false
  }
}

const refunding = ref<TicketLine | null>(null)
const refundingTicketId = ref<string | null>(null)
const refundFailure = ref<string | null>(null)
const cancelConfirming = ref(false)
const cancelling = ref(false)
const cancelFailure = ref<string | null>(null)

function askRefund(ticket: TicketLine): void {
  refundFailure.value = null
  refunding.value = ticket
}

// The last ticket out closes the booking with it, so nothing reads "Paid, £0.00" afterwards.
const refundingLast = computed(() => selected.value?.tickets.length === 1)
const refundConsequence = computed(() => (refundingLast.value
  ? 'Hand the money back on the reader first. This is the last ticket, so the booking is cancelled with it.'
  : 'Hand the money back on the reader first. The seat goes back on sale.'))

// D-116 criterion 5: refunded tickets leave the owed list the instant the write commits, and move
// to the refunded one below it. Criterion 6's cancel follows the last refund, as its own request.
async function refundTicket(): Promise<void> {
  const ticket = refunding.value
  if (!selected.value || !ticket) return
  refundingTicketId.value = ticket.ticketId
  refundFailure.value = null
  try {
    await $fetch(`/api/box-office/desk/reservations/${selected.value.id}/tickets/${ticket.ticketId}/refund`, {
      method: 'POST',
      body: { expectedTotalPence: ticket.pricePaid },
    })
    refunding.value = null
    const after = await $fetch<ReservationDetail>(`/api/box-office/desk/reservations/${selected.value.id}`)
    selected.value = after
    if (after.status === 'COLLECTED' && after.tickets.length === 0) {
      await cancelCollected()
      if (cancelFailure.value === null) toast.add({ title: 'Refunded in full', description: 'The booking is cancelled.', icon: 'i-lucide-check', color: 'success' })
    }
    else {
      toast.add({ title: 'Ticket refunded', icon: 'i-lucide-check', color: 'success' })
    }
    await search()
    void loadSummary()
  }
  catch (error) {
    refundFailure.value = refusalText(error)
  }
  finally {
    refundingTicketId.value = null
  }
}

// Criterion 6: the button only ever asks for a cancel once nothing is stranded; the route
// refuses regardless, since a screen that briefly disagrees is not the enforcement.
async function cancelCollected(): Promise<void> {
  if (!selected.value) return
  cancelling.value = true
  cancelFailure.value = null
  try {
    await $fetch(`/api/box-office/desk/reservations/${selected.value.id}/cancel`, { method: 'POST' })
    if (cancelConfirming.value) toast.add({ title: 'Booking cancelled', icon: 'i-lucide-check', color: 'success' })
    cancelConfirming.value = false
    selected.value = await $fetch<ReservationDetail>(`/api/box-office/desk/reservations/${selected.value.id}`)
    await search()
    void loadSummary()
  }
  catch (error) {
    cancelFailure.value = refusalText(error)
  }
  finally {
    cancelling.value = false
  }
}

const BY_PASS = 'Booked with a pass'

function byPass(booking: { status: string, holdExpiresAt: number | null, totalPence: number }): boolean {
  return booking.status === 'PENDING' && nothingToCollect(booking.holdExpiresAt, booking.totalPence)
}

const statusColor: Record<string, 'success' | 'neutral' | 'error' | 'warning'> = {
  PENDING: 'warning',
  COLLECTED: 'success',
  DOOR: 'success',
  CANCELLED: 'error',
  EXPIRED: 'error',
  NO_SHOW: 'neutral',
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const resultColumns: TableColumn<SearchRow>[] = [
  {
    id: 'reference',
    header: 'Booking',
    meta: { class: { td: 'whitespace-normal' } },
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'font-mono' }, row.original.reference),
      // While the table is narrow its lesser columns carry over into the cells before them, so Open
      // stays in view beside the Tonight card and on a phone (K-123 criterion 9, issue 922).
      h('div', { class: `${SHOW_BELOW_TABLE_2XL} text-xs text-muted` }, saysBooker(row.original.bookerName)),
    ]),
  },
  {
    id: 'booker',
    header: 'Booked by',
    meta: { class: { th: HIDE_BELOW_TABLE_2XL, td: `${HIDE_BELOW_TABLE_2XL} whitespace-normal` } },
    cell: ({ row }) => saysBooker(row.original.bookerName),
  },
  {
    id: 'status',
    header: 'State',
    meta: { class: { td: 'whitespace-normal' } },
    cell: ({ row }) => h('div', {}, [
      // A pass booking owes nothing, so it reads as settled rather than unpaid (issue 1390).
      byPass(row.original)
        ? h(UBadge, { color: 'success', variant: 'subtle', ...WRAPPING_BADGE }, () => BY_PASS)
        : h(UBadge, {
            color: statusColor[row.original.status] ?? 'neutral',
            variant: 'subtle',
            ...WRAPPING_BADGE,
          }, () => saysDeskStatus(row.original.status)),
      h('div', { class: `${SHOW_BELOW_TABLE_MD} mt-1 font-mono text-xs text-muted` }, saysPrice(row.original.totalPence)),
    ]),
  },
  { id: 'total', header: 'Total', meta: RIGHT_ALIGNED_HIDE_BELOW_TABLE_MD, cell: ({ row }) => saysPrice(row.original.totalPence) },
  {
    id: 'act',
    header: ACTIONS_HEADER,
    meta: ACTIONS_COLUMN,
    cell: ({ row }) => h(UButton, {
      'size': 'sm',
      'loading': openingId.value === row.original.id,
      'disabled': openingId.value !== null && openingId.value !== row.original.id,
      'data-test': `desk-open-${row.original.id}`,
      'onClick': () => openReservation(row.original.id),
    }, () => 'Open'),
  },
]
</script>

<template>
  <ReadGate
    :failure="nightlyFailure"
    class="space-y-6"
    data-test="desk-page"
    @retry="refreshNightly"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          :aria-label="nightly?.previousNight ? `Previous night with a performance, ${saysDeskNight(nightly.previousNight)}` : 'No earlier performances'"
          :disabled="!nightly?.previousNight"
          data-test="desk-previous-night"
          @click="nightly && goTo(nightly.previousNight)"
        />
        <span
          class="text-sm font-medium"
          data-test="desk-night"
        >{{ nightly ? saysDeskNight(nightly.night) : '' }}</span>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          :aria-label="nightly?.nextNight ? `Next night with a performance, ${saysDeskNight(nightly.nextNight)}` : 'No later performances'"
          :disabled="!nightly?.nextNight"
          data-test="desk-next-night"
          @click="nightly && goTo(nightly.nextNight)"
        />
        <DateField
          v-model="pickedNight"
          aria-label="Go to a night"
          data-test="desk-night-picker"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :disabled="nightly?.night === nightly?.tonight"
          data-test="desk-tonight"
          @click="night = null; performanceId = undefined; refreshNightly()"
        >
          Tonight
        </UButton>
      </div>

      <USelect
        v-if="nightly && nightly.performances.length > 0"
        v-model="performanceId"
        :items="nightly.performances.map(p => ({ label: `${p.showTitle} · ${p.venueName}`, value: p.id }))"
        aria-label="Performance"
        class="w-72"
        data-test="desk-performance"
      />
      <p
        v-else-if="nightly"
        class="text-sm text-muted"
      >
        Nothing on this night.
      </p>
    </div>

    <UAlert
      v-if="summaryFailure"
      color="error"
      variant="subtle"
      :description="summaryFailure"
      data-test="desk-summary-failure"
    />

    <div
      v-if="summary"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
      data-test="desk-summary"
    >
      <UCard
        v-for="tile in summaryTiles"
        :key="tile.key"
        :data-test="`desk-summary-${tile.key}`"
      >
        <p class="text-sm text-muted">
          {{ tile.label }}
        </p>
        <p class="text-2xl font-semibold">
          {{ tile.value }}
        </p>
      </UCard>
    </div>

    <UAlert
      v-if="summary && summary.unpaidCount > 0"
      color="warning"
      variant="subtle"
      icon="i-lucide-clock-alert"
      :title="`${plural(summary.unpaidCount, 'unpaid ticket')} · ${saysPrice(summary.unpaidOwedPence)} owed`"
      :description="unpaidSays"
      data-test="desk-unpaid-alert"
    />

    <div class="grid gap-6 lg:grid-cols-3">
      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="scanned"
              placeholder="Scan a booking's QR"
              aria-label="Booking QR"
              class="w-64"
              data-test="desk-scan"
              @keyup.enter="scan"
            />
            <UButton
              :loading="scanning"
              data-test="desk-scan-submit"
              @click="scan"
            >
              Find the booking
            </UButton>
            <UButton
              v-if="cameraOpen"
              color="neutral"
              variant="subtle"
              icon="i-lucide-camera-off"
              data-test="desk-scan-camera-close"
              @click="cameraOpen = false"
            >
              Stop the camera
            </UButton>
            <UButton
              v-else
              color="neutral"
              variant="subtle"
              icon="i-lucide-camera"
              data-test="desk-scan-camera"
              @click="openCamera"
            >
              Scan with the camera
            </UButton>
            <UInput
              v-model="q"
              placeholder="Reference, name or email"
              aria-label="Reference, name or email"
              class="w-64"
              data-test="desk-search"
              @keyup.enter="search"
            />
            <UButton
              :loading="searching"
              color="neutral"
              variant="subtle"
              data-test="desk-search-submit"
              @click="search"
            >
              Search
            </UButton>
          </div>
          <p
            v-if="cameraNote"
            class="mt-2 text-sm text-muted"
            data-test="desk-scan-camera-note"
          >
            {{ cameraNote }}
          </p>
          <QrScanner
            v-if="cameraOpen"
            class="mt-3 w-full max-w-sm"
            @decoded="scanDecoded"
            @unavailable="fallBackToTyping"
          />
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              v-for="pill in DESK_STATUS_FILTERS"
              :key="pill"
              size="sm"
              :color="statusFilter === pill ? 'primary' : 'neutral'"
              :variant="statusFilter === pill ? 'solid' : 'subtle'"
              :data-test="`desk-status-${pill.toLowerCase()}`"
              @click="statusFilter = pill"
            >
              {{ DESK_STATUS_LABELS[pill] }}
            </UButton>
          </div>
          <p
            v-if="searchedFor"
            class="mt-2 text-sm text-muted"
            data-test="desk-searched-for"
          >
            Showing matches for "{{ searchedFor }}" only.
            <UButton
              variant="link"
              size="sm"
              class="p-0"
              data-test="desk-search-clear"
              @click="clearSearch"
            >
              Clear the search
            </UButton>
          </p>
        </template>

        <UAlert
          v-if="searchFailure || scanFailure"
          color="error"
          variant="subtle"
          :description="searchFailure ?? scanFailure ?? ''"
          class="mb-4"
        />

        <UTable
          :data="results"
          :columns="resultColumns"
          class="@container"
          data-test="desk-results"
        >
          <template #empty>
            <p
              class="py-6 text-center text-sm text-muted"
              data-test="desk-empty"
            >
              {{ emptySays }}
            </p>
          </template>
        </UTable>
      </UCard>

      <!-- Beside the bookings rather than under them, so a walk-up is never a scroll away. -->
      <div class="space-y-6">
        <UCard
          v-if="performanceId"
          data-test="desk-walk-up"
        >
          <template #header>
            <p class="font-medium">
              Walk-up
            </p>
          </template>

          <UAlert
            v-if="walkUpOptionsFailure"
            color="error"
            variant="subtle"
            :description="walkUpOptionsFailure"
            data-test="desk-walk-up-options-failure"
          />
          <p
            v-else-if="walkUpOptions.length === 0"
            class="text-sm text-muted"
            data-test="desk-walk-up-empty"
          >
            No ticket types on this performance. Add one under Box office, Ticket types.
          </p>
          <div
            v-else
            class="space-y-3"
          >
            <UFormField
              v-for="option in walkUpOptions"
              :key="option.id"
              :label="`${option.name} · ${saysPrice(option.price)}`"
            >
              <UInputNumber
                v-model="walkUpQuantities[option.id]"
                :min="0"
                :max="lineMax(option.id)"
                :disabled="seatsLeft === 0"
                class="w-32"
                :data-test="`desk-walk-up-quantity-${option.id}`"
              />
            </UFormField>

            <p class="text-sm text-muted">
              A name and an email are optional. With them, the booking's QR is emailed; without, the reference is all they need.
            </p>
            <UFormField label="Booker's name">
              <UInput
                v-model="walkUpGuest.name"
                class="w-full"
                data-test="desk-walk-up-name"
              />
            </UFormField>
            <UFormField label="Booker's email">
              <UInput
                v-model="walkUpGuest.email"
                type="email"
                class="w-full"
                data-test="desk-walk-up-email"
                @update:model-value="walkUpGuest.existingAccount = false"
              />
            </UFormField>
            <UCheckbox
              v-if="askExistingAccount"
              v-model="walkUpGuest.existingAccount"
              label="It is their account"
              description="File the booking under the account this address already belongs to."
              data-test="desk-walk-up-existing-account"
            />

            <p
              class="text-lg font-semibold"
              data-test="desk-walk-up-total"
            >
              Due now: {{ saysPrice(walkUpTotal) }}
            </p>

            <UAlert
              v-if="walkUpFailure"
              color="error"
              variant="subtle"
              :description="walkUpFailure"
              data-test="desk-walk-up-failure"
            />

            <p
              v-if="walkUpBlockedSays"
              id="desk-walk-up-blocked"
              class="text-sm text-muted"
              data-test="desk-walk-up-blocked"
            >
              {{ walkUpBlockedSays }}
            </p>

            <UButton
              :loading="selling"
              :disabled="walkUpBlockedSays !== null"
              :aria-describedby="walkUpBlockedSays === null ? undefined : 'desk-walk-up-blocked'"
              data-test="desk-walk-up-sell"
              @click="takeWalkUp"
            >
              Sell {{ saysPrice(walkUpTotal) }}
            </UButton>
          </div>
        </UCard>

        <UCard
          v-if="summary"
          data-test="desk-tonight"
        >
          <template #header>
            <p class="font-medium">
              {{ nightly ? saysDeskNight(nightly.night) : 'Tonight' }}
            </p>
          </template>
          <dl class="space-y-3 text-sm">
            <div class="flex items-baseline justify-between gap-2">
              <dt class="text-muted">
                Access bookings
              </dt>
              <dd data-test="desk-access-bookings">
                {{ summary.accessBookings }}
                <NuxtLink
                  to="/tonight/door"
                  class="text-xs text-muted underline"
                >
                  see the door screen
                </NuxtLink>
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-2">
              <dt class="text-muted">
                Pass admissions
              </dt>
              <dd data-test="desk-pass-admissions">
                {{ summary.passAdmissions }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-2">
              <dt class="text-muted">
                Reservations release
              </dt>
              <dd
                class="font-mono"
                data-test="desk-reservations-release"
              >
                {{ releaseTime }}
              </dd>
            </div>
            <div class="flex items-baseline justify-between gap-2">
              <dt class="text-muted">
                On shift
              </dt>
              <dd data-test="desk-on-shift">
                {{ summary.onShift.length > 0 ? summary.onShift.join(' · ') : 'Nobody confirmed yet' }}
              </dd>
            </div>
          </dl>
        </UCard>

        <DeskWaitingList
          v-if="performanceId"
          :key="performanceId"
          :performance-id="performanceId"
        />
      </div>
    </div>

    <UModal
      v-model:open="open"
      :title="selected ? `Reference ${selected.reference}` : ''"
      :description="selected ? `${selected.showTitle}, ${saysWhen(selected.startsAt)}, ${saysBooker(selected.bookerName)}` : ''"
    >
      <template #body>
        <div
          v-if="selected"
          class="space-y-4"
        >
          <UAlert
            v-if="collectFailure"
            color="error"
            variant="subtle"
            :description="collectFailure"
          />

          <UAlert
            v-if="otherPerformanceSays(selected, performanceId)"
            color="warning"
            variant="subtle"
            icon="i-lucide-calendar-x"
            :description="otherPerformanceSays(selected, performanceId) ?? ''"
            data-test="desk-other-performance"
          />

          <UAlert
            v-if="selected.doorWording"
            color="info"
            variant="subtle"
            icon="i-lucide-accessibility"
            :description="selected.doorWording"
            data-test="desk-door-wording"
          />

          <ul
            v-if="selected.status !== 'COLLECTED'"
            class="space-y-1 text-sm"
          >
            <li
              v-for="ticket in selected.tickets"
              :key="ticket.ticketId"
              class="flex justify-between"
            >
              <span>
                {{ ticket.ticketTypeName }}
                <UBadge
                  v-if="ticket.accessKind"
                  size="sm"
                  variant="subtle"
                  color="info"
                >
                  {{ ticket.accessKind === 'ACCESS' ? 'Access' : 'Companion' }}
                </UBadge>
              </span>
              <span>{{ saysPrice(ticket.pricePaid) }}</span>
            </li>
          </ul>

          <UAlert
            v-if="passBookingSays"
            color="success"
            variant="subtle"
            icon="i-lucide-wallet-cards"
            :description="passBookingSays"
            data-test="desk-pass-booking"
          />
          <template v-else-if="selected.status === 'PENDING'">
            <UFormField
              label="Tender"
              :help="DESK_CASH_SAYS"
            >
              <!-- A URadioGroup, not USelect: choosing a value inside a select nested in this modal
                   left its own backdrop swallowing clicks after close (a Nuxt UI defect). -->
              <URadioGroup
                v-model="tender"
                orientation="horizontal"
                :items="tenderOptions.map(value => ({ label: value === 'COMP' ? 'Comp' : 'Card', value }))"
                data-test="desk-tender"
              />
            </UFormField>

            <template v-if="tender === 'COMP'">
              <UAlert
                v-if="compApproved"
                color="success"
                variant="subtle"
                icon="i-lucide-check"
                :description="`Approved by ${selected.compRequest?.decidedByName}.`"
                data-test="desk-comp-approved"
              />
              <UAlert
                v-else-if="selected.compRequest?.status === 'PENDING' && !selected.compRequest.expired"
                id="desk-collect-blocked"
                color="info"
                variant="subtle"
                icon="i-lucide-clock"
                :description="collectBlockedSays ?? ''"
                data-test="desk-comp-pending"
              />
              <template v-else>
                <UAlert
                  v-if="selected.compRequest?.status === 'DECLINED'"
                  id="desk-collect-blocked"
                  color="error"
                  variant="subtle"
                  :description="collectBlockedSays ?? ''"
                  data-test="desk-comp-declined"
                />
                <UAlert
                  v-else-if="selected.compRequest?.expired"
                  id="desk-collect-blocked"
                  color="warning"
                  variant="subtle"
                  :description="collectBlockedSays ?? ''"
                  data-test="desk-comp-lapsed"
                />
                <p
                  v-else
                  id="desk-collect-blocked"
                  class="text-sm text-muted"
                  data-test="desk-comp-unasked"
                >
                  {{ collectBlockedSays }}
                </p>
                <UFormField
                  label="Reason for the comp"
                  required
                >
                  <UInput
                    v-model="compRequestReason"
                    data-test="desk-comp-reason"
                  />
                </UFormField>
                <UAlert
                  v-if="compRequestFailure"
                  color="error"
                  variant="subtle"
                  :description="compRequestFailure"
                />
                <UButton
                  variant="subtle"
                  :loading="requestingComp"
                  :disabled="!compRequestReason.trim()"
                  data-test="desk-request-comp"
                  @click="requestComp"
                >
                  Ask tonight's duty manager
                </UButton>
              </template>
            </template>

            <p
              class="text-lg font-semibold"
              data-test="desk-due"
            >
              Due now: {{ saysPrice(dueNow) }}
            </p>

            <UButton
              :loading="collecting"
              :disabled="collectBlockedSays !== null"
              :aria-describedby="collectBlockedSays === null ? undefined : 'desk-collect-blocked'"
              data-test="desk-collect"
              @click="collect"
            >
              Collect
            </UButton>
          </template>
          <template v-else-if="selected.status === 'COLLECTED'">
            <ul
              v-if="selected.tickets.length > 0"
              class="space-y-2 text-sm"
            >
              <li
                v-for="ticket in selected.tickets"
                :key="ticket.ticketId"
                class="flex items-center justify-between"
              >
                <span>{{ ticket.ticketTypeName }} · {{ saysPrice(ticket.pricePaid) }}</span>
                <UButton
                  size="xs"
                  color="error"
                  variant="subtle"
                  :data-test="`desk-refund-${ticket.ticketId}`"
                  @click="askRefund(ticket)"
                >
                  Refund
                </UButton>
              </li>
            </ul>
            <p
              v-else
              class="text-sm text-muted"
              data-test="desk-nothing-owing"
            >
              Every ticket on this booking has been refunded.
            </p>

            <UButton
              v-if="selected.tickets.length === 0"
              color="neutral"
              variant="subtle"
              data-test="desk-cancel-collected"
              @click="cancelFailure = null; cancelConfirming = true"
            >
              Cancel booking
            </UButton>
            <UAlert
              v-if="cancelFailure && !cancelConfirming"
              color="error"
              variant="subtle"
              :description="cancelFailure"
            />
          </template>
          <template v-else>
            <p
              class="text-sm text-muted"
              data-test="desk-uncollectable"
            >
              {{ uncollectableSays }}
            </p>

            <template v-if="reinstateSays === null">
              <UAlert
                v-if="reinstateFailure"
                color="error"
                variant="subtle"
                :description="reinstateFailure"
                data-test="desk-reinstate-failure"
              />

              <UFormField
                label="Reason for reinstating"
                description="Recorded against the booking. The seats are re-checked as this is written, so a resold house refuses it."
                required
              >
                <UInput
                  v-model="reinstateReason"
                  class="w-full"
                  :maxlength="REINSTATE_REASON_LIMIT"
                  data-test="desk-reinstate-reason"
                />
              </UFormField>

              <UButton
                :loading="reinstating"
                :disabled="!reinstateReason.trim()"
                data-test="desk-reinstate"
                @click="reinstate"
              >
                Reinstate booking
              </UButton>
            </template>
          </template>

          <div
            v-if="selected.refundedTickets.length > 0"
            data-test="desk-refunded"
          >
            <p class="text-sm font-medium text-muted">
              Refunded
            </p>
            <ul class="mt-1 space-y-1 text-sm text-muted">
              <li
                v-for="ticket in selected.refundedTickets"
                :key="ticket.ticketId"
                class="flex justify-between"
              >
                <span class="line-through">{{ ticket.ticketTypeName }}</span>
                <span class="line-through">{{ saysPrice(ticket.pricePaid) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </template>
    </UModal>

    <ConfirmModal
      :open="refunding !== null"
      name="desk-refund"
      title="Refund this ticket"
      :verb="`Refund ${saysPrice(refunding?.pricePaid ?? 0)}`"
      :consequence="refundConsequence"
      :loading="refundingTicketId !== null"
      :failure="refundFailure"
      @update:open="value => { if (!value) refunding = null }"
      @confirm="refundTicket"
    />

    <ConfirmModal
      v-model:open="cancelConfirming"
      name="desk-cancel"
      title="Cancel the booking"
      verb="Cancel the booking"
      consequence="It cannot be brought back. A booker who changes their mind again makes a new booking."
      :loading="cancelling"
      :failure="cancelFailure"
      @confirm="cancelCollected"
    />
  </ReadGate>
</template>
