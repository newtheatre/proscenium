<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatLondon } from '#shared/utils/london'
import { sendLogList } from '#shared/utils/send-log-list'
import type { DailyCount, SendLogRow } from '#shared/utils/notification-log'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Send log', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Listing {
  items: SendLogRow[]
  page: number
  pageSize: number
  total: number
  pages: number
}

const STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  SENT: 'success',
  FAILED: 'error',
  RETRYING: 'warning',
  SUPPRESSED_PREFERENCE: 'neutral',
  SKIPPED_UNDELIVERABLE: 'neutral',
  PENDING: 'neutral',
}

// Search, filters, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, set, setSort, clear } = useListQuery(sendLogList)

const listing = ref<Listing | null>(null)
const loading = ref(false)
const failure = ref<string | null>(null)

const daily = ref<DailyCount[] | null>(null)

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<Listing>('/api/admin/comms/send-log', { query: query.value })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

async function loadDaily(): Promise<void> {
  const response = await $fetch<{ days: DailyCount[] }>('/api/admin/comms/send-log/daily', { query: { days: 14 } })
  daily.value = response.days
}

watch(query, load)

const when = (at: number | null): string => at ? formatLondon(new Date(at * 1000), { dateStyle: 'medium', timeStyle: 'short' }) : 'Not sent'

const columns: TableColumn<SendLogRow>[] = [
  {
    id: 'recipient',
    header: 'Recipient',
    cell: ({ row }) => row.original.userId
      ? h(UButton, {
          to: `/comms/operations/accounts/${row.original.userId}`,
          variant: 'link',
          color: 'neutral',
          class: 'p-0',
        }, () => row.original.recipientName ?? row.original.userId)
      : 'No account',
  },
  { accessorKey: 'type', header: 'Type', meta: { class: { td: 'font-mono text-sm' } } },
  { accessorKey: 'channel', header: 'Channel' },
  {
    id: 'status',
    header: 'Outcome',
    cell: ({ row }) => h(UBadge, { color: STATUS_COLOR[row.original.status] ?? 'neutral', variant: 'subtle', size: 'sm' }, () => row.original.status),
  },
  { id: 'createdAt', header: 'Enqueued', cell: ({ row }) => formatLondon(new Date(row.original.createdAt * 1000), { dateStyle: 'medium', timeStyle: 'short' }) },
  { id: 'sentAt', header: 'Sent', cell: ({ row }) => when(row.original.sentAt) },
  { accessorKey: 'error', header: 'Error', meta: { class: { td: 'text-sm text-muted' } } },
]

onMounted(() => {
  void load()
  void loadDaily()
})
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <section
      v-if="daily"
      class="space-y-2"
      data-test="daily-counts"
    >
      <h2 class="font-semibold">
        Last 14 days
      </h2>
      <p
        v-if="daily.length === 0"
        class="text-sm text-muted"
      >
        Nothing sent in this window.
      </p>
      <table
        v-else
        class="w-full text-sm"
      >
        <thead>
          <tr class="border-b text-left text-muted">
            <th class="py-2">
              Day
            </th><th>Type</th><th>Outcome</th><th>Count</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in daily"
            :key="`${row.day}-${row.type}-${row.status}`"
            class="border-b last:border-0"
          >
            <td class="py-2">
              {{ row.day }}
            </td><td class="font-mono">
              {{ row.type }}
            </td><td>{{ row.status }}</td><td>{{ row.count }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <AdminToolbar
      v-model:search="search"
      :placeholder="sendLogList.search?.placeholder"
      :active="active"
      :loading="loading"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="sendLogList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>
    </AdminToolbar>

    <UTable
      :data="listing?.items ?? []"
      :columns="columns"
      :loading="loading"
      data-test="send-log-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ active.length ? 'Nothing matches that.' : 'Nothing sent yet.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="send-log-total"
        class="text-sm text-muted"
      >
        {{ plural(listing?.total ?? 0, 'send') }}
      </p>
      <UPagination
        v-if="listing && listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>
  </div>
</template>
