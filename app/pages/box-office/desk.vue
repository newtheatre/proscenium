<script setup lang="ts">
import { DESK_STATUS_FILTERS, DESK_TENDERS, REINSTATE_REASON_LIMIT, reinstateRefusal, uncollectableReason } from '#shared/utils/desk'
import { saysClock } from '#shared/utils/when'
import { saysPrice } from '#shared/utils/ticket-types'
import type { DeskStatusFilter, DeskTender } from '#shared/utils/desk'
import type { ScannerFailure } from '~/composables/useQrScanner'

// Comp authority is the request and its approval now, not a permission the desk screen checks
// itself (D-117): every tender is always offered, and the route is what actually decides.
const tenderOptions = [...DESK_TENDERS]

const STATUS_PILL_LABELS: Record<DeskStatusFilter, string> = {
  ALL: 'All',
  PENDING: 'Pending',
  COLLECTED: 'Collected',
  DOOR: 'Door',
}

definePageMeta({ layout: 'console', title: 'Desk', middleware: 'console', docs: '/docs/box-office/the-desk' })

interface DeskPerformance {
  id: string
  showTitle: string
  venueName: string
  startsAt: number
}

interface Nightly {
  night: string
  previousNight: string
  nextNight: string
  performances: DeskPerformance[]
}

interface SearchRow {
  id: string
  reference: string
  status: string
  bookerName: string
  totalPence: number
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
  showTitle: string
  startsAt: number
  bookerName: string
  bookerEmail: string
  tickets: TicketLine[]
  doorWording: string | null
  compRequest: ReservationCompRequest | null
}

interface DeskSummary {
  capacity: number | null
  reserved: number
  collected: number
  door: number
  unpaidCount: number
  unpaidOwedPence: number
  accessBookings: number
  passAdmissions: number
  reservationsReleaseAt: number
  onShift: string[]
}

const request = useRequestFetch()
const toast = useToast()
const night = ref<string | null>(null)
const performanceId = ref<string | undefined>(undefined)
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

// Capacity is uncapped for a general-admission house (D-105): headroom is then unbounded, so
// there is nothing here to put a number on. Reserved and door between them are every seat taken.
const walkUpHeadroom = computed(() => {
  if (!summary.value || summary.value.capacity === null) return null
  return Math.max(summary.value.capacity - summary.value.reserved - summary.value.door, 0)
})

const releaseTime = computed(() => (summary.value ? saysClock(summary.value.reservationsReleaseAt) : null))

interface SummaryTile { key: string, label: string, value: string }

const summaryTiles = computed<SummaryTile[]>(() => {
  if (!summary.value) return []
  const s = summary.value
  return [
    { key: 'capacity', label: 'Capacity', value: s.capacity === null ? 'Uncapped' : String(s.capacity) },
    { key: 'reserved', label: 'Reserved', value: String(s.reserved) },
    { key: 'collected', label: 'Collected', value: String(s.collected) },
    { key: 'door', label: 'Door', value: String(s.door) },
    { key: 'walk-up-headroom', label: 'Walk-up headroom', value: walkUpHeadroom.value === null ? 'Uncapped' : String(walkUpHeadroom.value) },
  ]
})

const { data: nightly, refresh: refreshNightly, error: nightlyError } = await useAsyncData<Nightly>(
  'desk-nightly',
  () => request('/api/box-office/desk/performances', { query: night.value ? { night: night.value } : {} }),
  { watch: [night] },
)

// The failure is shown rather than left to a silent "no results", since a fetch a shift opens on
// can refuse for reasons the empty state cannot say.
const nightlyFailure = computed(() => (nightlyError.value ? refusalText(nightlyError.value, 'Tonight could not be read.') : null))

watch(nightly, (value) => {
  if (value && !performanceId.value) performanceId.value = value.performances[0]?.id
}, { immediate: true })

function goTo(target: string): void {
  night.value = target
  performanceId.value = undefined
}

const results = ref<SearchRow[]>([])
const searching = ref(false)

async function search(): Promise<void> {
  if (!performanceId.value) return
  searching.value = true
  searchFailure.value = null
  try {
    const page = await $fetch<{ items: SearchRow[] }>('/api/box-office/desk/search', {
      query: { performanceId: performanceId.value, q: q.value.trim() || undefined, status: statusFilter.value },
    })
    results.value = page.items
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
  q.value = ''
  statusFilter.value = 'ALL'
  void search()
  void loadSummary()
}, { immediate: true })

watch(statusFilter, () => void search())

const selected = ref<ReservationDetail | null>(null)
const open = ref(false)
const tender = ref<DeskTender>('CARD')
const compRequestReason = ref('')
const requestingComp = ref(false)
const compRequestFailure = ref<string | null>(null)
const collecting = ref(false)
const collectFailure = ref<string | null>(null)

const reinstateReason = ref('')
const reinstating = ref(false)
const reinstateFailure = ref<string | null>(null)

const uncollectableSays = computed(() => (selected.value ? uncollectableReason(selected.value.status) : null))
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
const dueNow = computed(() => (tender.value === 'COMP' ? 0 : ticketTotalPence.value))
// D-117: only an approved, unexpired, unspent request lets a comp be collected.
const compApproved = computed(() => selected.value?.compRequest?.status === 'APPROVED' && !selected.value.compRequest.expired)

async function open2(id: string): Promise<void> {
  collectFailure.value = null
  tender.value = 'CARD'
  compRequestReason.value = ''
  compRequestFailure.value = null
  reinstateReason.value = ''
  reinstateFailure.value = null
  selected.value = await $fetch<ReservationDetail>(`/api/box-office/desk/reservations/${id}`)
  open.value = true
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
    tender.value = 'CARD'
    compRequestReason.value = ''
    compRequestFailure.value = null
    collectFailure.value = null
    reinstateReason.value = ''
    reinstateFailure.value = null
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

const cameraSays: Record<ScannerFailure, string> = {
  NO_CAMERA: 'No camera on this device, so scan into the field or type the reference.',
  REFUSED: 'Camera access refused, so scan into the field or type the reference. Allow it in the site settings to use it.',
  BROKEN: 'The camera would not start, so scan into the field or type the reference.',
}

function fallBackToTyping(failure: ScannerFailure): void {
  cameraOpen.value = false
  cameraNote.value = cameraSays[failure]
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

// D-116 criterion 5: refunded tickets leave this list the instant the write commits, since the
// route that reads it already filters to what is still unrefunded.
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
    toast.add({ title: 'Ticket refunded', icon: 'i-lucide-check', color: 'success' })
    refunding.value = null
    selected.value = await $fetch<ReservationDetail>(`/api/box-office/desk/reservations/${selected.value.id}`)
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
    toast.add({ title: 'Booking cancelled', icon: 'i-lucide-check', color: 'success' })
    cancelConfirming.value = false
    open.value = false
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

const statusColor: Record<string, 'success' | 'neutral' | 'error' | 'warning'> = {
  PENDING: 'warning',
  COLLECTED: 'success',
  DOOR: 'success',
  CANCELLED: 'error',
  EXPIRED: 'error',
  NO_SHOW: 'neutral',
}
</script>

<template>
  <div
    class="space-y-6"
    data-test="desk-page"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          aria-label="Previous night"
          data-test="desk-previous-night"
          @click="nightly && goTo(nightly.previousNight)"
        />
        <span
          class="text-sm font-medium"
          data-test="desk-night"
        >{{ nightly?.night }}</span>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          aria-label="Next night"
          data-test="desk-next-night"
          @click="nightly && goTo(nightly.nextNight)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          @click="night = null; refreshNightly()"
        >
          Today
        </UButton>
      </div>

      <USelect
        v-if="nightly && nightly.performances.length > 0"
        v-model="performanceId"
        :items="nightly.performances.map(p => ({ label: `${p.showTitle} · ${p.venueName}`, value: p.id }))"
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
      v-if="nightlyFailure"
      color="error"
      variant="subtle"
      :description="nightlyFailure"
      data-test="desk-nightly-failure"
    />

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
      :title="`${plural(summary.unpaidCount, 'unpaid reservation')} · ${saysPrice(summary.unpaidOwedPence)} owed`"
      :description="`Unpaid reservations release at ${releaseTime} for walk-ups.`"
      data-test="desk-unpaid-alert"
    />

    <div class="grid gap-6 lg:grid-cols-3">
      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="scanned"
              placeholder="Scan a booking's QR"
              class="w-64"
              data-test="desk-scan"
              @keyup.enter="scan"
            />
            <UButton
              :loading="scanning"
              data-test="desk-scan-submit"
              @click="scan"
            >
              Open
            </UButton>
            <UButton
              v-if="cameraOpen"
              color="neutral"
              variant="subtle"
              icon="i-lucide-camera-off"
              data-test="desk-scan-camera-close"
              @click="cameraOpen = false"
            >
              Close the camera
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
              placeholder="Reference or name"
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
              {{ STATUS_PILL_LABELS[pill] }}
            </UButton>
          </div>
        </template>

        <UAlert
          v-if="searchFailure || scanFailure"
          color="error"
          variant="subtle"
          :description="searchFailure ?? scanFailure ?? ''"
          class="mb-4"
        />

        <table
          class="w-full text-sm"
          data-test="desk-results"
        >
          <tbody>
            <tr
              v-for="row in results"
              :key="row.id"
              class="border-b border-default"
            >
              <td class="py-2 font-mono">
                {{ row.reference }}
              </td>
              <td class="py-2">
                {{ row.bookerName }}
              </td>
              <td class="py-2">
                <UBadge
                  :color="statusColor[row.status] ?? 'neutral'"
                  variant="subtle"
                >
                  {{ row.status }}
                </UBadge>
              </td>
              <td class="py-2 text-right">
                {{ saysPrice(row.totalPence) }}
              </td>
              <td class="py-2 text-right">
                <UButton
                  size="sm"
                  :data-test="`desk-open-${row.id}`"
                  @click="open2(row.id)"
                >
                  Open
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
        <p
          v-if="results.length === 0"
          class="py-6 text-center text-sm text-muted"
        >
          No results yet. Search, or scan a booking's code.
        </p>
      </UCard>

      <UCard
        v-if="summary"
        data-test="desk-tonight"
      >
        <template #header>
          <p class="font-medium">
            Tonight
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
    </div>

    <UModal
      v-model:open="open"
      :title="selected ? `Reference ${selected.reference}` : ''"
      :description="selected ? `${selected.showTitle}, ${selected.bookerName}` : ''"
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
            v-if="selected.doorWording"
            color="info"
            variant="subtle"
            icon="i-lucide-accessibility"
            :description="selected.doorWording"
            data-test="desk-door-wording"
          />

          <ul class="space-y-1 text-sm">
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

          <template v-if="selected.status === 'PENDING'">
            <UFormField label="Tender">
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
                color="info"
                variant="subtle"
                icon="i-lucide-clock"
                description="Waiting on tonight's duty manager to approve this."
                data-test="desk-comp-pending"
              />
              <template v-else>
                <UAlert
                  v-if="selected.compRequest?.status === 'DECLINED'"
                  color="error"
                  variant="subtle"
                  :description="`Declined: ${selected.compRequest.declineReason}`"
                />
                <UAlert
                  v-else-if="selected.compRequest?.expired"
                  color="warning"
                  variant="subtle"
                  description="That request lapsed; ask again."
                />
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
              :disabled="tender === 'COMP' && !compApproved"
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
        </div>
      </template>
    </UModal>

    <ConfirmModal
      :open="refunding !== null"
      name="desk-refund"
      title="Refund this ticket"
      :verb="`Refund ${saysPrice(refunding?.pricePaid ?? 0)}`"
      consequence="Hand the money back on the reader first. The seat goes back on sale."
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
  </div>
</template>
