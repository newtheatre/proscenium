<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { REASONS_BY_KIND, says, saysDeliveryCost, saysMovementSource, saysQuantity } from '#shared/utils/bar'
import { saysWhen } from '#shared/utils/when'
import { barMovementsList } from '#shared/utils/bar-movements-list'
import type { FilterOption } from '#shared/utils/list-filters'
import type { MovementReason, StockItem, StockMovement } from '#shared/utils/bar'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Movements', middleware: 'console', docs: '/docs/bar/movements' })

const UBadge = resolveComponent('UBadge')

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const saving = ref(false)
const reversing = ref<StockMovement | null>(null)
const reason = ref<MovementReason>('COUNT_CORRECTION')

interface Listing<T> { items: T[], total: number, pageSize: number, pages: number }

const noMovements = (): Listing<StockMovement> => ({ items: [], total: 0, pageSize: 0, pages: 1 })
const noItems = (): Listing<StockItem> => ({ items: [], total: 0, pageSize: 0, pages: 1 })

const { data: items } = await useAsyncData(
  'bar-movements-items',
  () => request<Listing<StockItem>>('/api/admin/bar/items', { query: { pageSize: 100 } }),
  { default: noItems },
)

const itemOptions = computed(() => items.value.items.map(item => ({ label: item.name, value: item.id })))
const filterOptions = computed<Record<string, FilterOption[]>>(() => ({ itemId: itemOptions.value }))

// Search, filters, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(barMovementsList, { options: filterOptions })

const { data, status, error, refresh } = await useAsyncData(
  'bar-movements',
  () => request<Listing<StockMovement>>('/api/admin/bar/movements', { query: query.value }),
  { watch: [query], default: noMovements },
)

// A reversal always posts REVERSAL, so only that kind's own reasons are offered (F-204, 3.5).
const reasonOptions = (REASONS_BY_KIND.REVERSAL ?? []).map(value => ({ label: says(value), value }))

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
      description: 'Both movements stay, and on hand is the sum across them.',
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

const listingFailure = useListFailure(error, 'The movements could not be read.')

const columns: TableColumn<StockMovement>[] = [
  {
    id: 'when',
    header: 'When',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap` } },
    cell: ({ row }) => saysWhen(row.original.createdAt),
  },
  {
    id: 'item',
    header: 'Stocked item',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.itemName),
      row.original.refTable
        ? h('div', { class: 'text-xs text-muted' }, `From ${saysMovementSource(row.original.refTable)}`)
        : null,
      // Below sm the when and the cost are hidden: shown here instead, so a phone keeps the row
      // actions in view without losing what they said (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, [saysWhen(row.original.createdAt), saysDeliveryCost(row.original)]
        .filter(Boolean).join(', ')),
    ]),
  },
  {
    id: 'kind',
    header: 'Movement',
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
    header: 'Cost',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-right whitespace-nowrap font-mono` } },
    cell: ({ row }) => saysDeliveryCost(row.original),
  },
  {
    id: 'act',
    header: ACTIONS_HEADER,
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => (row.original.kind === 'REVERSAL' || row.original.reversed
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
      :description="listingFailure.message"
      :actions="listingFailure.enrolPath ? [{ label: 'Set up an authenticator app', to: listingFailure.enrolPath, color: 'error' }] : []"
    />

    <p class="text-sm text-muted">
      Every delivery, sale, wastage and adjustment, newest first.
    </p>

    <AdminToolbar
      v-model:search="search"
      placeholder="A stocked item"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="barMovementsList"
          :conditions="conditions"
          :sort="sort"
          :options="filterOptions"
          @set="set"
          @sort="setSort"
        />
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
          {{ filtered ? 'No movement matches that.' : 'No movements yet. Record a delivery and stock starts adding up.' }}
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
            {{ saysWhen(reversing.createdAt) }}.
          </p>

          <UFormField
            label="Reason"
            name="reason"
            required
            description="From the list, so the report can group the correction."
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
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
