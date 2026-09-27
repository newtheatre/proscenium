<script setup lang="ts">
import { compApprovalLine } from '#shared/utils/night-hub'
import { saysPrice } from '#shared/utils/ticket-types'
import { saysClock } from '#shared/utils/when'

// The comps the duty manager decides, wherever the duty manager looks: the glance, and the hub's
// Waiting on you (D-117, F-110, issue 1304). Nothing is drawn while nothing waits.
const props = withDefaults(defineProps<{
  performanceId: string | null
  houses: { performanceId: string, showTitle: string, startsAt: number }[]
  title: string
  testId?: string
}>(), { testId: 'glance-comp-requests' })

const request = useRequestFetch()
const toast = useToast()

// The two pending queues the duty manager decides (D-117, F-110): tickets at the box office and
// drinks at the till. Each is hidden when its own route refuses this viewer, never pre-judged.
interface PendingComp {
  id: string
  // A bar ask carries the house it was made at; null is a night with no house there (F-126).
  performanceId?: string | null
  requestedBy: string
  requestedByName: string
  reason: string
  expired: boolean
}
interface PendingBarComp { request: PendingComp, priced: { totalPence: number, lines: { productName: string, variantLabel: string, qty: number }[] } }

const ticketComps = ref<PendingComp[] | null>(null)
const barComps = ref<PendingBarComp[] | null>(null)
const viewer = useViewer()

interface Queues { tickets: PendingComp[] | null, bar: PendingBarComp[] | null }

// Null with no house to ask about, which leaves the queues as they were.
async function readComps(performanceId: string | null): Promise<Queues | null> {
  if (!performanceId) return null
  const [tickets, bar] = await Promise.all([
    settleRead(() => request<{ items: PendingComp[] }>('/api/box-office/desk/comp-requests', { query: { performanceId } })),
    settleRead(() => request<{ requests: PendingBarComp[] }>('/api/till/comp-requests', { query: { performanceId } })),
  ])
  return {
    tickets: tickets.kind === 'READ' ? tickets.value.items.filter(one => !one.expired) : null,
    bar: bar.kind === 'READ' ? bar.value.requests.filter(one => !one.request.expired) : null,
  }
}

function apply(queues: Queues | null): void {
  if (!queues) return
  ticketComps.value = queues.tickets
  barComps.value = queues.bar
}

async function refresh(): Promise<void> {
  apply(await readComps(props.performanceId))
}

// In the served page, so a waiting ask is there from the first paint rather than pushing the
// screen down once it arrives (issue 1521).
useServedRead(`night-comp-queue-${props.testId}`, () => readComps(props.performanceId), apply)

const pendingComps = computed(() => [
  ...(ticketComps.value ?? []).map(one => ({ queue: 'TICKET' as const, request: one, priced: null })),
  ...(barComps.value ?? []).map(row => ({ queue: 'BAR' as const, request: row.request, priced: row.priced })),
])

const deciding = ref<string | null>(null)
const approving = ref<{ queue: 'TICKET' | 'BAR', id: string, line: string } | null>(null)
const approveFailure = ref<string | null>(null)
const declining = ref<{ queue: 'TICKET' | 'BAR', id: string } | null>(null)
const declineReason = ref('')
const declineFailure = ref<string | null>(null)

// Which house an ask was made at, in words. The queue is the venue's whole night, so on a
// two-house day this is what says which one a row belongs to (F-126).
function houseOf(performanceId: string | null | undefined): string | null {
  const house = props.houses.find(one => one.performanceId === performanceId)
  return house ? `${house.showTitle}, ${saysClock(house.startsAt)}` : null
}

const compRoute = (queue: 'TICKET' | 'BAR', id: string): string =>
  (queue === 'TICKET' ? `/api/box-office/desk/comp-requests/${id}` : `/api/till/comp-requests/${id}`)

// One tap gives money away, so the amount and who asked are read back first; declining already
// stops for a reason, and this is the other half of that pair (issue 1150 item 10).
function openApprove(queue: 'TICKET' | 'BAR', id: string, requestedByName: string, totalPence: number | null): void {
  approving.value = { queue, id, line: compApprovalLine(requestedByName, totalPence) }
  approveFailure.value = null
}

async function approveComp(): Promise<void> {
  const target = approving.value
  if (!target) return
  deciding.value = target.id
  approveFailure.value = null
  try {
    await $fetch(`${compRoute(target.queue, target.id)}/approve`, { method: 'POST' })
    toast.add({ title: 'Comp approved', icon: 'i-lucide-check', color: 'success' })
    approving.value = null
    await refresh()
  }
  catch (refused) {
    approveFailure.value = refusalText(refused)
  }
  finally {
    deciding.value = null
  }
}

function openDecline(queue: 'TICKET' | 'BAR', id: string): void {
  declining.value = { queue, id }
  declineReason.value = ''
  declineFailure.value = null
}

async function declineComp(): Promise<void> {
  const target = declining.value
  if (!target || !declineReason.value.trim()) return
  deciding.value = target.id
  declineFailure.value = null
  try {
    await $fetch(`${compRoute(target.queue, target.id)}/decline`, { method: 'POST', body: { reason: declineReason.value.trim() } })
    toast.add({ title: 'Comp declined', icon: 'i-lucide-check', color: 'success' })
    declining.value = null
    await refresh()
  }
  catch (refused) {
    declineFailure.value = refusalText(refused)
  }
  finally {
    deciding.value = null
  }
}

// An ask lapses in minutes, so the queue polls on its own beside whatever screen holds it.
const POLL_MS = 20_000
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(refresh, POLL_MS)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
watch(() => props.performanceId, refresh)
</script>

<template>
  <div>
    <!-- Both queues in one place, because the person deciding is one person: the box office
         asks for a ticket and the till asks for a round, and neither waits on the other. -->
    <NightBlock
      v-if="pendingComps.length"
      :title="title"
      :data-test="testId"
    >
      <ul class="space-y-3">
        <li
          v-for="pending in pendingComps"
          :key="pending.request.id"
          class="space-y-2 rounded-lg bg-default p-3"
          :data-test="`comp-request-${pending.request.id}`"
        >
          <p class="font-semibold">
            {{ pending.queue === 'TICKET' ? 'Ticket' : 'Bar' }}<span v-if="pending.priced"> · {{ saysPrice(pending.priced.totalPence) }}</span>
          </p>
          <p class="text-sm">
            {{ pending.request.reason }}
          </p>
          <p
            v-if="pending.priced"
            class="text-sm text-muted"
          >
            {{ pending.priced.lines.map(line => `${line.qty} × ${line.productName}, ${line.variantLabel}`).join(' · ') }}
          </p>
          <p class="font-mono text-xs text-muted">
            asked by {{ pending.request.requestedByName }}
          </p>
          <p
            v-if="houseOf(pending.request.performanceId)"
            class="text-xs text-muted"
            :data-test="`comp-house-${pending.request.id}`"
          >
            Asked at {{ houseOf(pending.request.performanceId) }}
          </p>
          <p
            v-if="viewer && viewer.id === pending.request.requestedBy"
            class="text-sm text-muted"
          >
            Your own request: somebody else decides it.
          </p>
          <div
            v-else
            class="flex flex-wrap gap-2"
          >
            <UButton
              color="secondary"
              class="min-h-12"
              :data-test="`approve-comp-${pending.request.id}`"
              @click="openApprove(pending.queue, pending.request.id, pending.request.requestedByName, pending.priced?.totalPence ?? null)"
            >
              Approve
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              class="min-h-12"
              :data-test="`decline-comp-${pending.request.id}`"
              @click="openDecline(pending.queue, pending.request.id)"
            >
              Decline
            </UButton>
          </div>
        </li>
      </ul>
    </NightBlock>

    <NightSheet
      :open="approving !== null"
      title="Approve this comp"
      primary="Approve the comp"
      primary-color="secondary"
      primary-test-id="approve-comp-submit"
      :loading="deciding !== null"
      @update:open="approving = null"
      @primary="approveComp()"
    >
      <div
        class="space-y-4"
        data-test="approve-comp-form"
      >
        <p class="text-sm">
          {{ approving?.line }}
        </p>
        <UAlert
          v-if="approveFailure"
          data-test="approve-comp-failure"
          color="error"
          variant="subtle"
          :description="approveFailure"
        />
      </div>
    </NightSheet>

    <NightSheet
      :open="declining !== null"
      title="Decline this comp"
      primary="Decline the comp"
      primary-test-id="decline-comp-submit"
      :primary-disabled="!declineReason.trim()"
      :loading="deciding !== null"
      @update:open="declining = null"
      @primary="declineComp"
    >
      <form
        class="space-y-4"
        data-test="decline-comp-form"
        @submit.prevent="declineComp"
      >
        <UAlert
          v-if="declineFailure"
          data-test="decline-comp-failure"
          color="error"
          variant="subtle"
          :description="declineFailure"
        />

        <UFormField
          label="Why (the person who asked sees it)"
          required
        >
          <UInput
            v-model="declineReason"
            class="w-full"
            data-test="decline-comp-reason"
          />
        </UFormField>
      </form>
    </NightSheet>
  </div>
</template>
