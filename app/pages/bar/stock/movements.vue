<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { STOCK_MOVEMENT_KINDS, says, saysMoney, saysQuantity } from '#shared/utils/bar'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { MovementReason, StockItem, StockMovement, StockMovementKind } from '#shared/utils/bar'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Stock movements', middleware: 'console' })

const UBadge = resolveComponent('UBadge')

const request = useRequestFetch()
const toast = useToast()
const itemId = ref<string | undefined>(undefined)
const kind = ref<StockMovementKind | undefined>(undefined)
const page = ref(1)
const failure = ref<string | null>(null)
const saving = ref(false)
const reversing = ref<StockMovement | null>(null)
const reason = ref<MovementReason>('COUNT_CORRECTION')

interface Listing<T> { items: T[], total: number, pageSize: number, pages: number }

const noMovements = (): Listing<StockMovement> => ({ items: [], total: 0, pageSize: 0, pages: 1 })
const noItems = (): Listing<StockItem> => ({ items: [], total: 0, pageSize: 0, pages: 1 })

const { data, status, error, refresh } = await useAsyncData(
  'bar-movements',
  () => request<Listing<StockMovement>>('/api/admin/bar/movements', {
    query: { itemId: itemId.value, kind: kind.value, page: page.value },
  }),
  { watch: [page], default: noMovements },
)

const { data: items } = await useAsyncData(
  'bar-movements-items',
  () => request<Listing<StockItem>>('/api/admin/bar/items', { query: { pageSize: 100 } }),
  { default: noItems },
)

watch([itemId, kind], () => {
  if (page.value === 1) void refresh()
  else page.value = 1
})

const itemOptions = computed(() => items.value.items.map(item => ({ label: item.name, value: item.id })))
const kindOptions = STOCK_MOVEMENT_KINDS.map(value => ({ label: says(value), value }))
const reasonOptions = MOVEMENT_REASONS.map(value => ({ label: says(value), value }))

// Pinned to Europe/London, because the worker runs in UTC and half the year would read wrong.
const when = (at: number): string =>
  formatLondon(new Date(at * 1000), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

// A movement is never edited, so the only correction is one that cancels it and says why.
async function reverse(): Promise<void> {
  const original = reversing.value
  if (!original) return

  saving.value = true
  failure.value = null
  try {
    await $fetch('/api/admin/bar/movements', {
      method: 'POST',
      body: {
        itemId: original.itemId,
        kind: 'REVERSAL',
        qty: -original.qty,
        reason: reason.value,
        reversesId: original.id,
      },
    })
    toast.add({
      title: 'Movement reversed',
      description: 'Both rows stay, and on hand is the sum across them.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    reversing.value = null
    await refresh()
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'The movements could not be read.') : null))

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (itemId.value) {
    const named = items.value.items.find(item => item.id === itemId.value)?.name ?? 'one item'
    active.push({ key: 'item', label: `For ${named}`, icon: 'i-lucide-package', clear: () => {
      itemId.value = undefined
    } })
  }
  if (kind.value) {
    active.push({ key: 'kind', label: says(kind.value), icon: 'i-lucide-filter', clear: () => {
      kind.value = undefined
    } })
  }
  return active
})

const columns: TableColumn<StockMovement>[] = [
  {
    id: 'when',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => when(row.original.createdAt),
  },
  {
    id: 'item',
    header: 'Stocked item',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.itemName),
      row.original.refTable
        ? h('div', { class: 'text-xs text-muted' }, `From ${row.original.refTable.replaceAll('_', ' ')}`)
        : null,
    ]),
  },
  {
    id: 'kind',
    header: 'What happened',
    cell: ({ row }) => h('div', { class: 'flex flex-wrap items-center gap-2' }, [
      h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => says(row.original.kind)),
      row.original.reason ? h('span', { class: 'text-xs text-muted' }, says(row.original.reason)) : null,
    ]),
  },
  {
    id: 'qty',
    header: 'Quantity',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => `${row.original.qty > 0 ? '+' : ''}${saysQuantity(row.original.qty, row.original.unit)}`,
  },
  {
    id: 'cost',
    header: 'Cost a unit',
    cell: ({ row }) => (row.original.unitCostPence === null ? '' : saysMoney(row.original.unitCostPence)),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => (row.original.kind === 'REVERSAL' || row.original.reversesId
      ? null
      : h(resolveComponent('UButton'), {
          'size': 'sm',
          'color': 'neutral',
          'variant': 'ghost',
          'data-test': `reverse-${row.original.id}`,
          'onClick': () => {
            failure.value = null
            reason.value = 'COUNT_CORRECTION'
            reversing.value = row.original
          },
        }, () => 'Reverse')),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="listingFailure"
      data-test="listing-failure"
      color="error"
      variant="subtle"
      :description="listingFailure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-arrow-left-right"
      title="Every movement stays exactly as it was written"
      description="Nothing here can be edited or deleted. A mistake is corrected with a reversing movement that names the original, and both rows remain, so any on hand figure can be traced to its causes."
    />

    <AdminToolbar
      placeholder="A movement"
      :filterable="true"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="itemId = undefined; kind = undefined"
    >
      <template #filters>
        <UFormField label="Stocked item">
          <USelect
            v-model="itemId"
            :items="itemOptions"
            placeholder="Every item"
            class="w-48"
            data-test="movements-item"
          />
        </UFormField>
        <UFormField label="What happened">
          <USelect
            v-model="kind"
            :items="kindOptions"
            placeholder="Everything"
            class="w-48"
            data-test="movements-kind"
          />
        </UFormField>
      </template>
    </AdminToolbar>

    <UTable
      :data="data.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="bar-movements-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No movements yet. Record a delivery and stock starts adding up.
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="bar-movements-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'movement') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>

    <UModal
      :open="reversing !== null"
      :title="reversing ? `Reverse this ${says(reversing.kind).toLowerCase()}` : ''"
      description="This writes a second movement cancelling the first. The original stays exactly where it is."
      @update:open="reversing = null; failure = null"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="failure"
            data-test="reverse-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <p
            v-if="reversing"
            class="text-sm text-muted"
          >
            {{ reversing.itemName }}, {{ saysQuantity(reversing.qty, reversing.unit) }}, recorded
            {{ when(reversing.createdAt) }}.
          </p>

          <UFormField
            label="Reason"
            name="reason"
            required
            description="From the list, so a correction can be reported on rather than read."
          >
            <USelect
              v-model="reason"
              :items="reasonOptions"
              class="w-full"
              data-test="reverse-reason"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <UButton
          :loading="saving"
          data-test="confirm-reverse"
          @click="reverse"
        >
          Reverse it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="reversing = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
