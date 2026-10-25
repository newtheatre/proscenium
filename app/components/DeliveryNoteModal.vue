<script setup lang="ts">
import { DELIVERY_COST_QUESTION, MAX_DELIVERY_LINES, SAYS_NOT_POUNDS, deliveryCostBasis, saysQuantity } from '#shared/utils/bar'
import { MAX_PAGE_SIZE } from '#shared/utils/pagination'
import { toOrder } from '#shared/utils/ordering'
import { plural } from '#shared/utils/text'
import type { StockItem } from '#shared/utils/bar'
import type { OrderListRow } from '#shared/utils/ordering'
import type { Page } from '#shared/utils/pagination'

// One delivery of many items on one sheet, saved together, each line its own movement (0254).
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [], recorded: [count: number] }>()

const toast = useToast()
const items = ref<StockItem[]>([])
const find = ref('')
const reading = ref(false)
const saving = ref(false)
const filling = ref(false)
const failure = ref<string | null>(null)
// Typed per item: how many came in, counted as the order list counts them, and what it cost.
const counts = ref<Record<string, number | undefined>>({})
const costs = ref<Record<string, number | undefined>>({})

watch(() => props.open, async (open) => {
  if (!open) return
  counts.value = {}
  costs.value = {}
  failure.value = null
  find.value = ''
  reading.value = true
  try {
    // Every page, since a delivery can bring any item; each page is its own fixed query.
    const read: StockItem[] = []
    for (let page = 1, pages = 1; page <= pages; page++) {
      const answer = await $fetch<Page<StockItem>, string>(`/api/admin/bar/items?retired=false&sort=name&pageSize=${MAX_PAGE_SIZE}&page=${page}`)
      read.push(...answer.items)
      pages = answer.pages
    }
    items.value = read
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    reading.value = false
  }
}, { immediate: true })

// Whole bottles or kegs where the item has one size, the way the order list counts them (0140).
const inContainers = (item: StockItem): boolean => item.unit === 'ML' && item.containerMl !== null
const countLabel = (item: StockItem): string => inContainers(item) ? `× ${item.containerMl} ml` : item.unit === 'ML' ? 'ml' : 'each'
const qtyOf = (item: StockItem): number => (counts.value[item.id] ?? 0) * (inContainers(item) ? item.containerMl! : 1)

const shown = computed(() => {
  const term = find.value.trim().toLowerCase()
  return term === '' ? items.value : items.value.filter(item => item.name.toLowerCase().includes(term))
})
const lines = computed(() => items.value.filter(item => counts.value[item.id] !== undefined && (Number.isNaN(counts.value[item.id]) || counts.value[item.id]! > 0)))

async function fillFromOrderList(): Promise<void> {
  filling.value = true
  failure.value = null
  try {
    const { shortfalls } = await $fetch<{ shortfalls: OrderListRow[] }, string>('/api/admin/bar/order-list')
    let filled = 0
    for (const row of shortfalls) {
      const count = toOrder(row) ?? row.shortfall
      if (count <= 0 || !items.value.some(item => item.id === row.id)) continue
      counts.value[row.id] = count
      filled++
    }
    toast.add({ title: filled === 0 ? 'Nothing on the order list to fill' : `${plural(filled, 'line')} filled from the order list`, description: 'Change any line to what actually came in.', icon: 'i-lucide-list-checks' })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    filling.value = false
  }
}

async function record(): Promise<void> {
  const uncounted = lines.value.find(item => Number.isNaN(counts.value[item.id]))
  const unpriced = lines.value.find(item => costs.value[item.id] !== undefined && Number.isNaN(costs.value[item.id]))
  if (uncounted) {
    failure.value = `${uncounted.name}: type a whole number of what came in.`
    return
  }
  if (unpriced) {
    failure.value = `${unpriced.name}: ${SAYS_NOT_POUNDS}. Leave the cost empty if it is not known.`
    return
  }
  saving.value = true
  failure.value = null
  try {
    const body = { lines: lines.value.map(item => ({ itemId: item.id, qty: qtyOf(item), costPence: costs.value[item.id] ?? null })) }
    const answer = await $fetch<{ recorded: number }>('/api/admin/bar/deliveries', { method: 'POST', body })
    toast.add({ title: `Delivery recorded: ${plural(answer.recorded, 'line')}`, description: 'On-hand has moved with every line.', icon: 'i-lucide-check', color: 'success' })
    emit('recorded', answer.recorded)
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="Record a delivery note"
    description="Type what came in against each item, or fill the sheet from the order list and correct it. Saving records every line at once, each as its own delivery."
    :ui="{ content: 'sm:max-w-3xl' }"
    @update:open="value => { if (!value) emit('close') }"
  >
    <template #body>
      <UAlert
        v-if="failure"
        data-test="delivery-failure"
        class="mb-4"
        color="error"
        variant="subtle"
        :description="failure"
      />
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <UButton
          icon="i-lucide-list-checks"
          variant="outline"
          color="neutral"
          :loading="filling"
          data-test="delivery-fill"
          @click="fillFromOrderList"
        >
          Fill from the order list
        </UButton>
        <UInput
          v-model="find"
          icon="i-lucide-search"
          placeholder="Find an item"
          aria-label="Find an item on the sheet"
          class="w-56"
          data-test="delivery-find"
        />
      </div>
      <p
        v-if="reading"
        class="text-sm text-muted"
      >
        Reading the stocked items
      </p>
      <div
        v-else
        class="max-h-[55vh] overflow-y-auto"
      >
        <table
          class="w-full text-sm"
          data-test="delivery-sheet"
        >
          <thead class="sticky top-0 bg-default text-left text-xs text-muted">
            <tr>
              <th class="py-2 pe-2 font-medium">
                Item
              </th>
              <th class="py-2 pe-2 font-medium">
                Came in
              </th>
              <th class="py-2 font-medium">
                Cost
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="item in shown"
              :key="item.id"
              :data-test="`delivery-line-${item.id}`"
            >
              <td class="py-2 pe-2">
                <span class="font-medium">{{ item.name }}</span>
                <span class="block text-xs text-muted">{{ saysQuantity(item.onHand, item.unit) }} on hand</span>
              </td>
              <td class="py-2 pe-2">
                <div class="flex items-center gap-1">
                  <WholeField
                    v-model="counts[item.id]"
                    class="w-20"
                    :aria-label="`How many ${item.name} came in`"
                    :data-test="`delivery-count-${item.id}`"
                  />
                  <span class="text-xs text-muted">{{ countLabel(item) }}</span>
                </div>
              </td>
              <td class="py-2">
                <PoundsField
                  v-model="costs[item.id]"
                  class="w-28"
                  :aria-label="`${DELIVERY_COST_QUESTION[deliveryCostBasis(item)].label}, ${item.name}`"
                  :data-test="`delivery-cost-${item.id}`"
                />
                <span class="block text-xs text-muted">{{ DELIVERY_COST_QUESTION[deliveryCostBasis(item)].label }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-muted">
          A cost left empty is recorded as not known. A note holds at most {{ MAX_DELIVERY_LINES }} lines.
        </p>
        <UButton
          :disabled="lines.length === 0 || lines.length > MAX_DELIVERY_LINES"
          :loading="saving"
          data-test="delivery-submit"
          @click="record"
        >
          {{ lines.length === 0 ? 'Type what came in first' : `Record ${plural(lines.length, 'line')}` }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
