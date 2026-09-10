<script setup lang="ts">
import { DESK_TENDERS } from '#shared/utils/desk'
import { saysPrice } from '#shared/utils/ticket-types'
import type { DeskTender } from '#shared/utils/desk'

// Comp authority is the request and its approval now, not a permission the desk screen checks
// itself (D-117): every tender is always offered, and the route is what actually decides.
const tenderOptions = [...DESK_TENDERS]

definePageMeta({ layout: 'console', title: 'Desk', middleware: 'console' })

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
  showTitle: string
  startsAt: number
  bookerName: string
  bookerEmail: string
  tickets: TicketLine[]
  doorWording: string | null
  compRequest: ReservationCompRequest | null
}

const toast = useToast()
const night = ref<string | null>(null)
const performanceId = ref<string | undefined>(undefined)
const q = ref('')
const scanned = ref('')
const scanning = ref(false)
const searchFailure = ref<string | null>(null)
const scanFailure = ref<string | null>(null)

const { data: nightly, refresh: refreshNightly } = await useAsyncData<Nightly>(
  'desk-nightly',
  () => $fetch('/api/box-office/desk/performances', { query: night.value ? { night: night.value } : {} }),
  { watch: [night] },
)

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
      query: { performanceId: performanceId.value, q: q.value.trim() || undefined },
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

watch(performanceId, () => {
  results.value = []
  q.value = ''
  void search()
})

const selected = ref<ReservationDetail | null>(null)
const open = ref(false)
const tender = ref<DeskTender>('CARD')
const compRequestReason = ref('')
const requestingComp = ref(false)
const compRequestFailure = ref<string | null>(null)
const collecting = ref(false)
const collectFailure = ref<string | null>(null)

const ticketTotalPence = computed(() => selected.value?.tickets.reduce((total, ticket) => total + ticket.pricePaid, 0) ?? 0)
const dueNow = computed(() => (tender.value === 'COMP' ? 0 : ticketTotalPence.value))
// D-117: only an approved, unexpired, unspent request lets a comp be collected.
const compApproved = computed(() => selected.value?.compRequest?.status === 'APPROVED' && !selected.value.compRequest.expired)

async function open2(id: string): Promise<void> {
  collectFailure.value = null
  tender.value = 'CARD'
  compRequestReason.value = ''
  compRequestFailure.value = null
  selected.value = await $fetch<ReservationDetail>(`/api/box-office/desk/reservations/${id}`)
  open.value = true
}

async function scan(): Promise<void> {
  if (!scanned.value.trim()) return
  scanning.value = true
  scanFailure.value = null
  try {
    selected.value = await $fetch<ReservationDetail>('/api/box-office/desk/scan', {
      method: 'POST',
      body: { scanned: scanned.value.trim() },
    })
    tender.value = 'CARD'
    compRequestReason.value = ''
    compRequestFailure.value = null
    collectFailure.value = null
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
  }
  catch (error) {
    collectFailure.value = refusalText(error)
  }
  finally {
    collecting.value = false
  }
}

const refundingTicketId = ref<string | null>(null)
const refundFailure = ref<string | null>(null)
const cancelling = ref(false)
const cancelFailure = ref<string | null>(null)

// D-116 criterion 5: refunded tickets leave this list the instant the write commits, since the
// route that reads it already filters to what is still unrefunded.
async function refundTicket(ticket: TicketLine): Promise<void> {
  if (!selected.value) return
  refundingTicketId.value = ticket.ticketId
  refundFailure.value = null
  try {
    await $fetch(`/api/box-office/desk/reservations/${selected.value.id}/tickets/${ticket.ticketId}/refund`, {
      method: 'POST',
      body: { expectedTotalPence: ticket.pricePaid },
    })
    toast.add({ title: 'Ticket refunded', icon: 'i-lucide-check', color: 'success' })
    selected.value = await $fetch<ReservationDetail>(`/api/box-office/desk/reservations/${selected.value.id}`)
    await search()
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
    open.value = false
    await search()
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

    <UCard>
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
              <USelect
                v-model="tender"
                :items="tenderOptions"
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
            <UAlert
              v-if="refundFailure"
              color="error"
              variant="subtle"
              :description="refundFailure"
            />

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
                  :loading="refundingTicketId === ticket.ticketId"
                  :data-test="`desk-refund-${ticket.ticketId}`"
                  @click="refundTicket(ticket)"
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

            <UAlert
              v-if="cancelFailure"
              color="error"
              variant="subtle"
              :description="cancelFailure"
            />

            <UButton
              v-if="selected.tickets.length === 0"
              color="neutral"
              variant="subtle"
              :loading="cancelling"
              data-test="desk-cancel-collected"
              @click="cancelCollected"
            >
              Cancel booking
            </UButton>
          </template>
          <p
            v-else
            class="text-sm text-muted"
            data-test="desk-uncollectable"
          >
            {{ selected.status }}: this booking cannot be collected from here.
          </p>
        </div>
      </template>
    </UModal>
  </div>
</template>
