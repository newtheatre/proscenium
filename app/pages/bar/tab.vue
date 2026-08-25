/**
 * Your own bar tab: tap what you took, settle up later on the reader.
 * Alcohol is not here at all (ADR-0030). Design: docs/13 §4.6
 */
<script setup lang="ts">
definePageMeta({
  layout: false,
  middleware: ['bar-tab'],
  title: 'My bar tab',
})

interface ChoiceSlot { itemId: string, categoryId: string, categoryName: string, qty: number }
interface Product { id: string, categoryId: string, categoryName: string, name: string, pricePence: number, slots: ChoiceSlot[] }
interface BasketLine { key: string, product: Product, qty: number, choices: Array<{ itemId: string, productId: string }> }
interface Menu {
  outstandingPence: number
  softCapPence: number
  products: Product[]
  choiceOptions: Record<string, Array<{ id: string, name: string }>>
}
interface ChargeItem { name: string, qty: number, unitPricePence: number }
interface Charge { id: string, takenAt: string, takenOn: string, totalPence: number, items: ChargeItem[] }

const requestFetch = useRequestFetch()
const toast = useToast()

const { data: menu, refresh: refreshMenu } = await useAsyncData(
  'bar-tab-menu',
  () => requestFetch<Menu>('/api/bar/tabs/menu'),
)
const { data: mine, refresh: refreshMine } = await useAsyncData(
  'bar-tab-mine',
  () => requestFetch<{ outstanding: Charge[], outstandingPence: number }>('/api/bar/tabs/mine'),
)

const products = computed<Product[]>(() => menu.value?.products ?? [])
const categories = computed(() => [...new Set(products.value.map(p => p.categoryName))])
const activeCategory = ref<string | null>(null)
const shown = computed(() =>
  products.value.filter(p => !activeCategory.value || p.categoryName === activeCategory.value))

const outstanding = computed<Charge[]>(() => mine.value?.outstanding ?? [])
const outstandingPence = computed(() => mine.value?.outstandingPence ?? 0)
const overCap = computed(() => outstandingPence.value > (menu.value?.softCapPence ?? Infinity))

const basket = ref<BasketLine[]>([])
const total = computed(() => basket.value.reduce((t, l) => t + l.product.pricePence * l.qty, 0))
const busy = ref(false)

// Choices, so the same drink with two different mixers is two basket lines.
const choosing = ref<Product | null>(null)
const picks = ref<Record<string, string>>({})
const optionsFor = (categoryId: string) => menu.value?.choiceOptions[categoryId] ?? []
const optionName = (categoryId: string, id: string) => optionsFor(categoryId).find(o => o.id === id)?.name ?? 'Something'
const picksComplete = computed(() => choosing.value?.slots.every(slot => picks.value[slot.itemId]) ?? false)

function lineLabel(line: BasketLine) {
  if (!line.choices.length) return line.product.name
  const names = line.choices.map((choice) => {
    const slot = line.product.slots.find(s => s.itemId === choice.itemId)
    return slot ? optionName(slot.categoryId, choice.productId) : 'Something'
  })
  return `${line.product.name} (${names.join(', ')})`
}

function add(product: Product) {
  if (product.slots.length) {
    choosing.value = product
    picks.value = {}
    return
  }
  addLine(product, [])
}

function addLine(product: Product, choices: BasketLine['choices']) {
  const key = [product.id, ...choices.map(c => c.productId)].join('|')
  const line = basket.value.find(l => l.key === key)
  if (line) line.qty += 1
  else basket.value.push({ key, product, qty: 1, choices })
}

function confirmChoices() {
  const product = choosing.value
  if (!product) return
  addLine(product, product.slots.map(slot => ({ itemId: slot.itemId, productId: picks.value[slot.itemId]! })))
  choosing.value = null
}

function remove(key: string) {
  const index = basket.value.findIndex(l => l.key === key)
  if (index < 0) return
  const line = basket.value[index]!
  if (line.qty > 1) line.qty -= 1
  else basket.value.splice(index, 1)
}

async function putOnTab() {
  busy.value = true
  try {
    const result = await requestFetch<{ totalPence: number }>('/api/bar/tabs', {
      method: 'POST',
      body: {
        items: basket.value.map(l => ({ productId: l.product.id, qty: l.qty, choices: l.choices })),
        expectedTotalPence: total.value,
      },
    })
    basket.value = []
    toast.add({ title: `${formatMoney(result.totalPence)} on your tab`, color: 'success' })
    await Promise.all([refreshMine(), refreshMenu()])
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

async function removeCharge(id: string) {
  busy.value = true
  try {
    await requestFetch(`/api/bar/tabs/${id}/void`, { method: 'POST', body: {} })
    toast.add({ title: 'Taken off your tab', color: 'success' })
    await refreshMine()
  }
  catch (error) {
    toast.add({
      title: 'Not removed',
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
  <div class="min-h-screen bg-neutral-950 pb-48 text-neutral-100">
    <div class="mx-auto max-w-2xl px-4 py-6">
      <header class="mb-4 flex items-baseline justify-between gap-3">
        <h1 class="text-xl font-semibold">
          My bar tab
        </h1>
        <NuxtLink
          to="/account/tab"
          class="text-sm text-neutral-400 underline underline-offset-4"
        >
          History
        </NuxtLink>
      </header>

      <div class="mb-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <p class="text-xs uppercase tracking-widest text-neutral-500">
          You owe
        </p>
        <p class="font-mono text-3xl font-bold">
          {{ formatMoney(outstandingPence) }}
        </p>
        <p
          v-if="overCap"
          class="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-300"
        >
          Please settle up when you next see someone with the reader.
        </p>
      </div>

      <section
        v-if="outstanding.length"
        class="mb-6"
      >
        <h2 class="mb-2 text-xs uppercase tracking-widest text-neutral-500">
          On your tab
        </h2>
        <ul class="space-y-2">
          <li
            v-for="charge in outstanding"
            :key="charge.id"
            class="flex items-start justify-between gap-3 rounded-md border border-neutral-800 px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm">
                {{ charge.items.map(i => `${i.qty} x ${i.name}`).join(', ') || 'Bar items' }}
              </p>
              <p class="text-xs text-neutral-500">
                {{ formatDateTime(charge.takenAt) }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span class="font-mono text-sm">{{ formatMoney(charge.totalPence) }}</span>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-x"
                :disabled="busy"
                aria-label="Take this off my tab"
                @click="removeCharge(charge.id)"
              />
            </div>
          </li>
        </ul>
      </section>

      <p class="mb-3 text-xs text-neutral-500">
        Alcohol goes on a tab only at a staffed bar, where someone can check ID.
      </p>

      <div class="mb-3 flex flex-wrap gap-2">
        <UButton
          :variant="activeCategory === null ? 'solid' : 'soft'"
          size="sm"
          label="All"
          @click="() => { activeCategory = null }"
        />
        <UButton
          v-for="category in categories"
          :key="category"
          :variant="activeCategory === category ? 'solid' : 'soft'"
          size="sm"
          :label="category"
          @click="() => { activeCategory = category }"
        />
      </div>

      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          v-for="product in shown"
          :key="product.id"
          type="button"
          class="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-left active:bg-neutral-800"
          @click="add(product)"
        >
          <span class="block text-sm font-medium">{{ product.name }}</span>
          <span class="block font-mono text-xs text-neutral-400">
            {{ formatMoney(product.pricePence) }}<template v-if="product.slots.length"> · choose</template>
          </span>
        </button>
      </div>

      <UAlert
        v-if="!shown.length"
        class="mt-4"
        color="neutral"
        variant="subtle"
        title="Nothing to put on a tab"
        description="Nothing priced is available without a staffed bar. Ask the bar manager."
      />
    </div>

    <div
      v-if="basket.length"
      class="fixed inset-x-0 bottom-0 border-t border-neutral-800 bg-neutral-900/95 backdrop-blur"
    >
      <div class="mx-auto flex max-w-2xl items-end justify-between gap-4 px-4 py-4">
        <div class="min-w-0">
          <ul class="mb-2 space-y-1">
            <li
              v-for="line in basket"
              :key="line.key"
              class="flex items-center gap-2 text-sm"
            >
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-minus"
                :aria-label="`One fewer ${line.product.name}`"
                @click="remove(line.key)"
              />
              <span class="truncate">{{ line.qty }} x {{ lineLabel(line) }}</span>
            </li>
          </ul>
          <p class="font-mono text-2xl font-bold">
            {{ formatMoney(total) }}
          </p>
        </div>
        <UButton
          size="xl"
          :loading="busy"
          :disabled="!total || busy"
          :label="`Put ${formatMoney(total)} on my tab`"
          @click="putOnTab"
        />
      </div>
    </div>

    <UModal
      :open="Boolean(choosing)"
      :title="choosing ? `What goes in the ${choosing.name.toLowerCase()}?` : ''"
      @update:open="open => { if (!open) choosing = null }"
    >
      <template #body>
        <div
          v-if="choosing"
          class="space-y-4"
        >
          <div
            v-for="slot in choosing.slots"
            :key="slot.itemId"
          >
            <p class="mb-2 text-sm font-medium">
              {{ slot.categoryName }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="option in optionsFor(slot.categoryId)"
                :key="option.id"
                size="lg"
                :variant="picks[slot.itemId] === option.id ? 'solid' : 'soft'"
                :label="option.name"
                @click="() => { picks[slot.itemId] = option.id }"
              />
            </div>
            <p
              v-if="!optionsFor(slot.categoryId).length"
              class="text-sm text-muted"
            >
              Nothing in {{ slot.categoryName }} is stocked, so this cannot be added to your tab.
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="() => { choosing = null }"
          />
          <UButton
            :disabled="!picksComplete"
            label="Add"
            @click="confirmChoices"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
