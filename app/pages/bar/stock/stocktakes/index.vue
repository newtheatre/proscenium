<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { Stocktake } from '#shared/utils/stocktakes'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Stocktakes', middleware: 'console' })

const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')

const request = useRequestFetch()
const toast = useToast()
const failure = ref<string | null>(null)
const opening = ref(false)
const search = ref('')
const page = ref(1)

interface Listing<T> { items: T[], total: number, pageSize: number, pages: number }
const noStocktakes = (): Listing<Stocktake> => ({ items: [], total: 0, pageSize: 0, pages: 1 })

const { data, status, error } = await useAsyncData(
  'bar-stocktakes',
  () => request<Listing<Stocktake>>('/api/admin/bar/stocktakes', { query: { page: page.value } }),
  { watch: [page], default: noStocktakes },
)

const when = (at: number): string =>
  formatLondon(new Date(at * 1000), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const label = (item: Stocktake): string => (item.status === 'OPEN' ? 'Open' : 'Applied')

// Filters this page only, the same reach a page-at-a-time list has everywhere else: a search
// spanning every stocktake would need the server's own predicate, which nothing here asks for yet.
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value.items
  return data.value.items.filter(item =>
    label(item).toLowerCase().includes(term) || when(item.openedAt).toLowerCase().includes(term))
})

async function openStocktake(): Promise<void> {
  opening.value = true
  failure.value = null
  try {
    const result = await $fetch<{ ok: true, opened: boolean, stocktake: Stocktake }>('/api/admin/bar/stocktakes', { method: 'POST' })
    toast.add({
      title: result.opened ? 'Stocktake opened' : 'Joined the stocktake already open',
      icon: 'i-lucide-clipboard-list',
      color: 'success',
    })
    await navigateTo(`/bar/stock/stocktakes/${result.stocktake.id}`)
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    opening.value = false
  }
}

const listingFailure = computed(() => (error.value ? refusalText(error.value, 'Stocktakes could not be read.') : null))

const columns: TableColumn<Stocktake>[] = [
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, {
      color: row.original.status === 'OPEN' ? 'warning' : 'neutral',
      variant: 'subtle',
      size: 'sm',
    }, () => label(row.original)),
  },
  { id: 'opened', header: 'Opened', cell: ({ row }) => when(row.original.openedAt) },
  {
    id: 'applied',
    header: 'Applied',
    cell: ({ row }) => (row.original.appliedAt === null ? '' : when(row.original.appliedAt)),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h(UButton, {
      'size': 'sm',
      'color': 'neutral',
      'variant': 'ghost',
      'to': `/bar/stock/stocktakes/${row.original.id}`,
      'data-test': `stocktake-${row.original.id}`,
    }, () => (row.original.status === 'OPEN' ? 'Count' : 'View')),
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
      v-if="failure"
      data-test="open-failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="Open or applied"
      :filterable="false"
      :loading="status === 'pending'"
      @clear="search = ''"
    >
      <template #actions>
        <UButton
          data-test="open-stocktake"
          :loading="opening"
          icon="i-lucide-clipboard-list"
          @click="openStocktake"
        >
          Open a stocktake
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="filtered"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="bar-stocktakes-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No stocktakes yet.
        </p>
      </template>
    </UTable>

    <div
      v-if="data.pages > 1"
      class="flex justify-end"
    >
      <UPagination
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>
  </div>
</template>
