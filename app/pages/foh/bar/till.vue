/**
 * The counter till: two tabs over one basket, one figure to type into SumUp.
 * It records money; it never charges anything (ADR-0024). Design: docs/13 §4.1
 */
<script setup lang="ts">
definePageMeta({
  layout: 'foh',
  middleware: ['foh'],
  title: 'Till',
})

interface Product { id: string, categoryId: string, categoryName: string, name: string, pricePence: number, ageRestricted: boolean }
interface Discount { id: string, name: string, percent: number }
interface Tonight {
  night: string
  session: { id: string } | null
  alcoholTrained: boolean
  trainingNeedsReview: boolean
  performances: Array<{ id: string, startsAt: string, showTitle: string, venueName: string }>
  products: Product[]
  discounts: Discount[]
}
interface Found {
  id: string
  bookingRef: string
  firstName: string
  amountOwedPence: number
  alreadyPaid: boolean
  performance: { showTitle: string, startsAt: string, venueName: string, isTonight: boolean }
}

const requestFetch = useRequestFetch()
const toast = useToast()

// One page, two modes. The prefix is the only difference, so what a trainee
// practises cannot drift from the thing itself (docs/14 §8).
const route = useRoute()
const training = useTrainingMode('till')
// A refused start must never fall through to the live screen.
if (route.query.practice) await training.enter('bar-till')
await training.refresh()
training.leaveWhenPracticeEnds()
const api = training.api

const { data, refresh } = await useAsyncData('bar-tonight',
  () => requestFetch<Tonight>(api('/api/bar/tonight')),
  { watch: [training.active] })

const tonight = computed(() => data.value ?? null)
const products = computed<Product[]>(() => tonight.value?.products ?? [])
const categories = computed(() => [...new Set(products.value.map(p => p.categoryName))])
const activeCategory = ref<string | null>(null)
const shown = computed(() => products.value.filter(p => !activeCategory.value || p.categoryName === activeCategory.value))

const tab = ref<'tickets' | 'bar'>('bar')
const basketBar = ref<Array<{ product: Product, qty: number }>>([])
const basketTickets = ref<Found[]>([])
const discountId = ref<string | null>(null)
const busy = ref(false)

const discount = computed(() => tonight.value?.discounts.find(d => d.id === discountId.value) ?? null)
const barSubtotal = computed(() => basketBar.value.reduce((t, l) => t + l.product.pricePence * l.qty, 0))
const ticketSubtotal = computed(() => basketTickets.value.reduce((t, r) => t + r.amountOwedPence, 0))
/** Half up, once, on the bar subtotal only: the server does the same (§4.1.1). */
const discountPence = computed(() =>
  discount.value ? Math.floor((barSubtotal.value * discount.value.percent) / 100 + 0.5) : 0)
const total = computed(() => barSubtotal.value + ticketSubtotal.value - discountPence.value)

// Soft gate (docs/13 §5): blocking a sale over a training record we cannot
// always reach would shut the bar for an outage.

const showTrainingWarning = computed(() =>
  tonight.value !== null
  && !tonight.value.alcoholTrained
  && basketBar.value.some(line => line.product.ageRestricted))

const subLabel = computed(() => {
  if (barSubtotal.value && ticketSubtotal.value) return 'Bar + tickets in one transaction'
  if (ticketSubtotal.value) return 'Tickets only'
  return 'Bar only'
})

// Comps
interface CompLine { productId: string, name: string, qty: number, unitPricePence: number }
interface CompRequest {
  id: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED'
  reason: string
  note: string | null
  lines: CompLine[]
  grossPence: number
  requestedAt: string
  requestedBy: string | null
  decidedBy: string | null
}

const compOpen = ref(false)
const compReason = ref<'CAST_CREW' | 'COMMITTEE' | 'SPILLAGE' | 'OTHER'>('CAST_CREW')
const compNote = ref('')
const comps = ref<{ mayApprove: boolean, awaitingApproval: CompRequest[], mine: CompRequest[] }>({
  mayApprove: false,
  awaitingApproval: [],
  mine: [],
})

/** Ticket comps are a ticket type on the desk, not a bar comp (docs/13 §4.1.2). */
const canComp = computed(() => Boolean(basketBar.value.length) && !basketTickets.value.length)
const myPending = computed(() => comps.value.mine.find(c => c.status === 'PENDING') ?? null)
const myDecided = ref<CompRequest | null>(null)

async function pollComps() {
  // No sandbox exists for this, so it must not run in practice mode.
  if (training.active.value) return
  try {
    const next = await $fetch<typeof comps.value>(api('/api/bar/comps'))
    // A request of mine that has just been answered: show it, then let it go.
    const wasPending = myPending.value?.id
    comps.value = next
    if (wasPending) {
      const settled = next.mine.find(c => c.id === wasPending && c.status !== 'PENDING')
      if (settled) {
        myDecided.value = settled
        if (settled.status === 'APPROVED') {
          basketBar.value = []
          discountId.value = null
        }
      }
    }
  }
  catch {
    // A poll that fails is not worth a toast; the next one will be along.
  }
}

// Same short-polling transport as the comms board (ADR-0021). Never in
// practice: the comps queue is live data with no sandbox equivalent.
let compTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  if (training.active.value) return
  pollComps()
  compTimer = setInterval(pollComps, 5000)
})
onBeforeUnmount(() => {
  if (compTimer) clearInterval(compTimer)
})

async function requestComp() {
  // No sandbox exists for this, so it must not run in practice mode.
  if (training.active.value) return
  busy.value = true
  try {
    await $fetch(api('/api/bar/comps'), {
      method: 'POST',
      body: {
        items: basketBar.value.map(l => ({ productId: l.product.id, qty: l.qty })),
        reason: compReason.value,
        note: compNote.value || null,
      },
    })
    compOpen.value = false
    compNote.value = ''
    await pollComps()
    toast.add({ title: 'Sent to the duty manager', icon: 'i-lucide-send', color: 'info' })
  }
  catch (error) {
    toast.add({
      title: 'Not sent',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}

async function decideComp(id: string, decision: 'approve' | 'decline') {
  // No sandbox exists for this, so it must not run in practice mode.
  if (training.active.value) return
  busy.value = true
  try {
    await $fetch(api(`/api/bar/comps/${id}/${decision}`), { method: 'POST' })
    await pollComps()
  }
  catch (error) {
    toast.add({
      title: 'Not recorded',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}

const REASON_LABELS: Record<string, string> = {
  CAST_CREW: 'Cast & crew',
  COMMITTEE: 'Committee',
  SPILLAGE: 'Spillage',
  OTHER: 'Other',
}

function addProduct(product: Product) {
  const line = basketBar.value.find(l => l.product.id === product.id)
  if (line) line.qty++
  else basketBar.value.push({ product, qty: 1 })
}

function removeProduct(productId: string) {
  const index = basketBar.value.findIndex(l => l.product.id === productId)
  if (index === -1) return
  const line = basketBar.value[index]!
  if (line.qty > 1) line.qty--
  else basketBar.value.splice(index, 1)
}

const term = ref('')
const results = ref<Found[]>([])
const searching = ref(false)

async function search() {
  if (term.value.trim().length < 2) return
  searching.value = true
  try {
    results.value = await requestFetch<Found[]>(api('/api/bar/lookup'), { query: { q: term.value.trim() } })
  }
  finally {
    searching.value = false
  }
}

function addReservation(found: Found) {
  if (basketTickets.value.some(r => r.id === found.id)) return
  basketTickets.value.push(found)
  results.value = []
  term.value = ''
}

// Tabs
interface Debtor { userId: string, name: string, outstandingPence: number, softCapPence: number }
interface Holder { userId: string, name: string, outstandingPence: number }
const tabOpen = ref(false)
const tabEmail = ref('')
const debtor = ref<Debtor | null>(null)
const finding = ref(false)
const holders = ref<Holder[]>([])
const holdersAvailable = ref(false)
const holderSearch = ref('')
const softCap = ref(0)

/** Ticket money never goes on credit: it would mark a booking paid (ADR-0030). */
const canTab = computed(() => Boolean(basketBar.value.length) && !basketTickets.value.length)

const shownHolders = computed(() => {
  const term = holderSearch.value.trim().toLowerCase()
  if (!term) return holders.value
  return holders.value.filter(holder => holder.name.toLowerCase().includes(term))
})

async function openTab() {
  // No sandbox exists for this, so it must not run in practice mode.
  if (training.active.value) return
  debtor.value = null
  tabEmail.value = ''
  holderSearch.value = ''
  tabOpen.value = true
  try {
    const list = await $fetch<{ available: boolean, holders: Holder[], softCapPence: number }>(api('/api/bar/tabs/holders'))
    holders.value = list.holders
    holdersAvailable.value = list.available
    softCap.value = list.softCapPence
  }
  catch {
    // The email field is always there, so a missing list is not an error.
    holdersAvailable.value = false
  }
}

function pick(holder: Holder) {
  debtor.value = { ...holder, softCapPence: softCap.value }
}

async function findDebtor() {
  // No sandbox exists for this, so it must not run in practice mode.
  if (training.active.value) return
  finding.value = true
  try {
    debtor.value = await $fetch<Debtor>(api('/api/bar/tabs/debtor'), { query: { email: tabEmail.value } })
  }
  catch (error) {
    debtor.value = null
    toast.add({
      title: 'Not found',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    finding.value = false
  }
}

async function chargeToTab() {
  // No sandbox exists for this, so it must not run in practice mode.
  if (training.active.value) return
  if (!debtor.value) return
  busy.value = true
  try {
    const result = await requestFetch<{ totalPence: number }>(api('/api/bar/transactions'), {
      method: 'POST',
      body: {
        tender: 'TAB',
        tabDebtorUserId: debtor.value.userId,
        barItems: basketBar.value.map(l => ({ productId: l.product.id, qty: l.qty })),
        discountId: discountId.value,
        expectedTotalPence: total.value,
      },
    })
    basketBar.value = []
    discountId.value = null
    tabOpen.value = false
    toast.add({ title: `${formatMoney(result.totalPence)} on ${debtor.value.name}'s tab`, color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({
      title: 'Not recorded',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}

async function settleTab() {
  // No sandbox exists for this, so it must not run in practice mode.
  if (training.active.value) return
  if (!debtor.value) return
  busy.value = true
  try {
    const result = await requestFetch<{ totalPence: number }>(api('/api/bar/tabs/settle'), {
      method: 'POST',
      body: {
        debtorUserId: debtor.value.userId,
        expectedTotalPence: debtor.value.outstandingPence,
      },
    })
    tabOpen.value = false
    toast.add({ title: `Settled ${formatMoney(result.totalPence)}`, color: 'success' })
  }
  catch (error) {
    toast.add({
      title: 'Not settled',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}

async function takeCard() {
  busy.value = true
  try {
    const result = await requestFetch<{ totalPence: number }>(api('/api/bar/transactions'), {
      method: 'POST',
      body: {
        tender: 'CARD',
        barItems: basketBar.value.map(l => ({ productId: l.product.id, qty: l.qty })),
        reservationIds: basketTickets.value.map(r => r.id),
        discountId: discountId.value,
        expectedTotalPence: total.value,
      },
    })
    basketBar.value = []
    basketTickets.value = []
    discountId.value = null
    toast.add({ title: `Recorded ${formatMoney(result.totalPence)}`, color: 'success' })
    await refresh()
  }
  catch (error) {
    toast.add({
      title: 'Not recorded',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}

async function openBar() {
  // No sandbox exists for this, so it must not run in practice mode.
  if (training.active.value) return
  await requestFetch(api('/api/bar/sessions'), {
    method: 'POST',
    body: { performanceIds: tonight.value?.performances.map(p => p.id) ?? [] },
  })
  await refresh()
}

const closingNote = ref('')

/** Until this runs, every end-of-night report calls the bar unclosed. */
async function closeBar() {
  // No sandbox exists for this, so it must not run in practice mode.
  if (training.active.value) return
  const sessionId = tonight.value?.session?.id
  if (!sessionId) return
  busy.value = true
  try {
    await requestFetch(api(`/api/bar/sessions/${sessionId}/close`), {
      method: 'POST',
      body: { closingNote: closingNote.value || null },
    })
    closingNote.value = ''
    await refresh()
    toast.add({ title: 'Bar closed', icon: 'i-lucide-check', color: 'success' })
  }
  catch (error) {
    toast.add({
      title: 'Not closed',
      description: (error as { data?: { statusMessage?: string } }).data?.statusMessage,
      color: 'error',
    })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 pb-64 text-neutral-100">
    <div class="mx-auto max-w-3xl px-4 py-6">
      <header class="mb-4 flex items-baseline justify-between gap-3">
        <h1 class="text-xl font-semibold">
          Till
        </h1>
        <NuxtLink
          to="/foh"
          class="text-sm text-neutral-400 underline underline-offset-4"
        >
          Back
        </NuxtLink>
      </header>

      <UAlert
        v-if="!training.active.value && tonight && !tonight.session"
        class="mb-4"
        color="warning"
        variant="subtle"
        title="The bar is not open yet"
        description="Opening it groups tonight's takings into one session for the close."
      >
        <template #actions>
          <UButton
            size="xs"
            label="Open the bar"
            @click="openBar"
          />
        </template>
      </UAlert>

      <div
        v-if="!training.active.value && tonight?.session"
        class="mb-4 flex flex-wrap items-center gap-2"
      >
        <UInput
          v-model="closingNote"
          placeholder="Closing note (optional)"
          class="flex-1 min-w-48"
        />
        <UButton
          variant="subtle"
          color="neutral"
          :loading="busy"
          label="Close the bar"
          @click="closeBar"
        />
      </div>

      <div class="mb-4 flex gap-2">
        <UButton
          :variant="tab === 'bar' ? 'solid' : 'soft'"
          size="lg"
          label="Bar"
          @click="tab = 'bar'"
        />
        <UButton
          :variant="tab === 'tickets' ? 'solid' : 'soft'"
          size="lg"
          label="Tickets"
          @click="tab = 'tickets'"
        />
      </div>

      <section v-if="tab === 'bar'">
        <div class="mb-3 flex flex-wrap gap-2">
          <UButton
            size="xs"
            :variant="activeCategory === null ? 'solid' : 'soft'"
            label="All"
            @click="activeCategory = null"
          />
          <UButton
            v-for="category in categories"
            :key="category"
            size="xs"
            :variant="activeCategory === category ? 'solid' : 'soft'"
            :label="category"
            @click="activeCategory = category"
          />
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            v-for="product in shown"
            :key="product.id"
            type="button"
            class="min-h-20 rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-left hover:border-violet-600"
            @click="addProduct(product)"
          >
            <span class="block text-sm font-medium leading-tight">{{ product.name }}</span>
            <span class="mt-1 block text-sm text-neutral-400">{{ formatMoney(product.pricePence) }}</span>
          </button>
        </div>
      </section>

      <section v-else>
        <form
          class="mb-3 flex gap-2"
          @submit.prevent="search"
        >
          <UInput
            v-model="term"
            placeholder="Reference or name"
            size="lg"
            class="flex-1"
          />
          <UButton
            type="submit"
            size="lg"
            :loading="searching"
            label="Find"
          />
        </form>
        <div
          v-for="found in results"
          :key="found.id"
          class="mb-2 rounded-xl border border-neutral-800 bg-neutral-900 p-4"
        >
          <p class="font-mono text-sm tracking-widest">
            {{ found.bookingRef }}
          </p>
          <p class="text-sm">
            {{ found.firstName }} · {{ found.performance.showTitle }}
          </p>
          <p
            class="text-sm"
            :class="found.performance.isTonight ? 'text-neutral-400' : 'text-amber-400'"
          >
            {{ formatDateTime(found.performance.startsAt) }}
            <template v-if="!found.performance.isTonight">
              · not tonight
            </template>
          </p>
          <div class="mt-3 flex items-center justify-between gap-2">
            <span
              v-if="found.alreadyPaid"
              class="text-sm text-emerald-400"
            >Already paid</span>
            <UButton
              v-else
              size="sm"
              :label="`Add ${formatMoney(found.amountOwedPence)}`"
              @click="addReservation(found)"
            />
            <NuxtLink
              to="/admin/box-office/reservations"
              class="text-xs text-neutral-500 underline"
            >
              Edit on desk
            </NuxtLink>
          </div>
        </div>
      </section>
    </div>

    <!-- One basket, whichever tab put things in it. -->
    <div class="fixed inset-x-0 bottom-0 border-t border-neutral-800 bg-neutral-900/95 backdrop-blur">
      <div class="mx-auto max-w-3xl px-4 py-3">
        <div class="max-h-32 overflow-y-auto text-sm">
          <p
            v-for="line in basketTickets"
            :key="line.id"
            class="flex justify-between py-0.5 text-violet-300"
          >
            <span>{{ line.bookingRef }} · {{ line.performance.showTitle }}</span>
            <span>{{ formatMoney(line.amountOwedPence) }}</span>
          </p>
          <p
            v-for="line in basketBar"
            :key="line.product.id"
            class="flex items-center justify-between py-0.5"
          >
            <span>
              <button
                type="button"
                class="mr-2 text-neutral-500"
                @click="removeProduct(line.product.id)"
              >−</button>
              {{ line.qty }} × {{ line.product.name }}
            </span>
            <span>{{ formatMoney(line.product.pricePence * line.qty) }}</span>
          </p>
          <p
            v-if="!basketBar.length && !basketTickets.length"
            class="py-2 text-neutral-500"
          >
            Nothing in the basket.
          </p>
        </div>

        <div
          v-if="tonight?.discounts.length"
          class="mt-2 flex flex-wrap gap-1"
        >
          <UButton
            size="xs"
            :variant="discountId === null ? 'solid' : 'soft'"
            label="None"
            @click="discountId = null"
          />
          <UButton
            v-for="option in tonight.discounts"
            :key="option.id"
            size="xs"
            :variant="discountId === option.id ? 'solid' : 'soft'"
            :label="`${option.name} ${option.percent}%`"
            @click="discountId = option.id"
          />
        </div>

        <p
          v-if="discountPence"
          class="mt-1 text-xs text-neutral-400"
        >
          Bar {{ formatMoney(barSubtotal) }} − {{ discount?.percent }}% = {{ formatMoney(barSubtotal - discountPence) }}
          <template v-if="ticketSubtotal">
            · Tickets {{ formatMoney(ticketSubtotal) }}
          </template>
        </p>

        <div class="mt-2 flex items-end justify-between gap-3">
          <div>
            <p
              v-if="showTrainingWarning"
              class="mb-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
            >
              You&rsquo;re not recorded as trained to sell alcohol &mdash; ask the DM.
            </p>
            <p class="text-xs uppercase tracking-widest text-amber-300">
              Type into SumUp
            </p>
            <p class="font-mono text-4xl font-bold text-amber-400">
              {{ formatMoney(total) }}
            </p>
            <p class="text-xs text-neutral-500">
              {{ subLabel }}
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              size="xl"
              :disabled="!total || busy"
              :loading="busy"
              label="Card"
              @click="takeCard"
            />
            <UButton
              v-if="!training.active.value"
              size="xl"
              variant="soft"
              :disabled="!canTab || busy"
              label="Tab"
              @click="openTab"
            />
            <UButton
              v-if="!training.active.value"
              size="xl"
              variant="soft"
              :disabled="!canComp || busy || Boolean(myPending)"
              :label="myPending ? 'Waiting…' : 'Comp'"
              @click="compOpen = true"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- The approver's queue. Inline, because the DM is often the one serving. -->
    <div
      v-if="comps.awaitingApproval.length"
      class="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-2xl space-y-2 sm:left-auto sm:right-4 sm:mx-0"
    >
      <div
        v-for="request in comps.awaitingApproval"
        :key="request.id"
        class="rounded-lg border border-amber-500/40 bg-neutral-900 p-4 shadow-xl"
      >
        <p class="text-sm font-semibold text-amber-300">
          {{ request.requestedBy || 'Someone' }} is asking for a comp
        </p>
        <p class="mt-1 text-sm text-neutral-300">
          {{ request.lines.map(l => `${l.qty} x ${l.name}`).join(', ') }}
          &middot; {{ formatMoney(request.grossPence) }}
        </p>
        <p class="text-xs text-neutral-400">
          {{ REASON_LABELS[request.reason] ?? request.reason }}<template v-if="request.note">
            : {{ request.note }}
          </template>
        </p>
        <div class="mt-3 flex gap-2">
          <UButton
            size="sm"
            color="success"
            :loading="busy"
            label="Approve"
            @click="decideComp(request.id, 'approve')"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            :loading="busy"
            label="Decline"
            @click="decideComp(request.id, 'decline')"
          />
        </div>
      </div>
    </div>

    <!-- What happened to my own request. -->
    <div
      v-if="myPending || myDecided"
      class="fixed bottom-4 left-4 z-40 max-w-sm rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
    >
      <template v-if="myPending">
        <p class="text-sm font-medium text-neutral-200">
          Waiting for the duty manager
        </p>
        <p class="text-xs text-neutral-400">
          Expires ten minutes after asking. Ring it up properly if nobody answers.
        </p>
      </template>
      <template v-else-if="myDecided">
        <p
          class="text-sm font-medium"
          :class="myDecided.status === 'APPROVED' ? 'text-green-400' : 'text-neutral-300'"
        >
          <template v-if="myDecided.status === 'APPROVED'">
            Approved by {{ myDecided.decidedBy || 'the duty manager' }}
          </template>
          <template v-else-if="myDecided.status === 'DECLINED'">
            Declined by {{ myDecided.decidedBy || 'the duty manager' }}
          </template>
          <template v-else>
            That request expired
          </template>
        </p>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          class="mt-2"
          label="Clear"
          @click="myDecided = null"
        />
      </template>
    </div>

    <UModal
      v-model:open="compOpen"
      title="Comp this round"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            {{ basketBar.map(l => `${l.qty} x ${l.product.name}`).join(', ') }}
            &middot; {{ formatMoney(barSubtotal) }}
          </p>
          <UFormField
            label="What is it for"
            required
          >
            <USelectMenu
              v-model="compReason"
              :items="[
                { label: 'Cast & crew', value: 'CAST_CREW' },
                { label: 'Committee', value: 'COMMITTEE' },
                { label: 'Spillage', value: 'SPILLAGE' },
                { label: 'Other', value: 'OTHER' },
              ]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Tell the duty manager more"
            :required="compReason === 'OTHER'"
            help="They see this when deciding."
          >
            <UInput
              v-model="compNote"
              class="w-full"
            />
          </UFormField>
          <UAlert
            icon="i-lucide-info"
            color="neutral"
            variant="subtle"
            :title="comps.mayApprove ? 'You can approve this yourself' : 'Nothing is recorded yet'"
            :description="comps.mayApprove
              ? 'It is still recorded as approved by you.'
              : 'The duty manager has ten minutes to approve it.'"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="compOpen = false"
          />
          <UButton
            :loading="busy"
            :disabled="compReason === 'OTHER' && !compNote"
            :label="comps.mayApprove ? 'Ask, then approve' : 'Ask the duty manager'"
            @click="requestComp"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="tabOpen"
      title="Put it on a tab"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            {{ basketBar.map(l => `${l.qty} x ${l.product.name}`).join(', ') }}
            &middot; {{ formatMoney(total) }}
          </p>
          <template v-if="holdersAvailable && !debtor">
            <UInput
              v-model="holderSearch"
              icon="i-lucide-search"
              placeholder="Search by name"
              autocapitalize="off"
              class="w-full"
            />
            <div class="max-h-64 space-y-1 overflow-y-auto">
              <button
                v-for="holder in shownHolders"
                :key="holder.userId"
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-md border border-default px-3 py-2 text-left hover:bg-elevated"
                @click="pick(holder)"
              >
                <span class="truncate">{{ holder.name }}</span>
                <span
                  v-if="holder.outstandingPence"
                  class="shrink-0 text-sm text-muted tabular-nums"
                >owes {{ formatMoney(holder.outstandingPence) }}</span>
              </button>
              <p
                v-if="!shownHolders.length"
                class="px-1 py-2 text-sm text-muted"
              >
                Nobody by that name may run a tab. Committee roles are granted in stage-door.
              </p>
            </div>
          </template>

          <UFormField
            v-if="!holdersAvailable && !debtor"
            label="Their NNT email"
            help="Exact address. They need to have signed in to the site once."
          >
            <div class="flex gap-2">
              <UInput
                v-model="tabEmail"
                type="email"
                autocapitalize="off"
                class="flex-1"
                @keyup.enter="findDebtor"
              />
              <UButton
                :loading="finding"
                :disabled="!tabEmail"
                label="Find"
                @click="findDebtor"
              />
            </div>
          </UFormField>
          <div
            v-if="debtor"
            class="rounded-md border border-default p-3"
          >
            <p class="font-medium">
              {{ debtor.name }}
            </p>
            <p class="text-sm text-muted">
              Already owes {{ formatMoney(debtor.outstandingPence) }}
            </p>
            <p
              v-if="debtor.outstandingPence > debtor.softCapPence"
              class="mt-2 text-sm text-amber-500"
            >
              Over the tab limit. Ask them to settle up.
            </p>
            <UButton
              class="mt-2"
              size="xs"
              variant="ghost"
              color="neutral"
              label="Someone else"
              @click="debtor = null"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="tabOpen = false"
          />
          <UButton
            v-if="debtor && debtor.outstandingPence > 0"
            variant="soft"
            :loading="busy"
            :label="`Settle ${formatMoney(debtor.outstandingPence)} on the reader`"
            @click="settleTab"
          />
          <UButton
            :loading="busy"
            :disabled="!debtor || !total"
            label="Add to their tab"
            @click="chargeToTab"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
