/**
 * The counter till: two tabs over one basket, one figure to type into SumUp.
 * It records money; it never charges anything (ADR-0024). Design: docs/13 §4.1
 */
<script setup lang="ts">
definePageMeta({
  layout: false,
  middleware: ['foh'],
  title: 'Till',
})

interface Product { id: string, categoryId: string, categoryName: string, name: string, pricePence: number, ageRestricted: boolean }
interface Discount { id: string, name: string, percent: number }
interface Tonight {
  night: string
  session: { id: string } | null
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
const { data, refresh } = await useAsyncData('bar-tonight', () => requestFetch<Tonight>('/api/bar/tonight'))

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
/** Half up, once, on the bar subtotal only — the server does the same (§4.1.1). */
const discountPence = computed(() =>
  discount.value ? Math.floor((barSubtotal.value * discount.value.percent) / 100 + 0.5) : 0)
const total = computed(() => barSubtotal.value + ticketSubtotal.value - discountPence.value)

const subLabel = computed(() => {
  if (barSubtotal.value && ticketSubtotal.value) return 'Bar + tickets in one transaction'
  if (ticketSubtotal.value) return 'Tickets only'
  return 'Bar only'
})

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
    results.value = await requestFetch<Found[]>('/api/bar/lookup', { query: { q: term.value.trim() } })
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

async function takeCard() {
  busy.value = true
  try {
    const result = await requestFetch<{ totalPence: number }>('/api/bar/transactions', {
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
  await requestFetch('/api/bar/sessions', {
    method: 'POST',
    body: { performanceIds: tonight.value?.performances.map(p => p.id) ?? [] },
  })
  await refresh()
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
        v-if="tonight && !tonight.session"
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
              size="xl"
              variant="soft"
              disabled
              label="Comp"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
