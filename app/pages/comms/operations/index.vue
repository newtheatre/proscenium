<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysWhen } from '#shared/utils/when'
import { sendLogList } from '#shared/utils/send-log-list'
import { saysNotificationStatus } from '#shared/utils/notifications'
import type { DailyCount, SendLogRow } from '#shared/utils/notification-log'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Send log', middleware: 'console', docs: '/docs/communications/send-log' })

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

const when = (at: number | null): string => at ? saysWhen(at) : 'Not sent'

const columns: TableColumn<SendLogRow>[] = [
  {
    id: 'recipient',
    header: 'Recipient',
    cell: ({ row }) => h('div', {}, [
      row.original.userId
        ? h(UButton, {
            to: `/comms/operations/accounts/${row.original.userId}`,
            variant: 'link',
            color: 'neutral',
            class: 'p-0',
          }, () => row.original.recipientName ?? row.original.userId)
        : h('span', {}, 'No account'),
      // Below sm the type, the channel, the enqueued time and any error are hidden: shown here
      // instead, so a phone keeps the outcome and the sent time in view (issue 922).
      h('div', { class: 'sm:hidden text-xs text-muted' }, [
        `${row.original.type}, ${row.original.channel}`,
        `enqueued ${saysWhen(row.original.createdAt)}`,
        row.original.error,
      ].filter(Boolean).join(' · ')),
    ]),
  },
  { accessorKey: 'type', header: 'Type', meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} font-mono text-sm` } } },
  { accessorKey: 'channel', header: 'Channel', meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } } },
  {
    id: 'status',
    header: 'Outcome',
    cell: ({ row }) => h(UBadge, { color: STATUS_COLOR[row.original.status] ?? 'neutral', variant: 'subtle', size: 'sm' }, () => saysNotificationStatus(row.original.status)),
  },
  {
    id: 'createdAt',
    header: 'Enqueued',
    meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} whitespace-nowrap` } },
    cell: ({ row }) => saysWhen(row.original.createdAt),
  },
  { id: 'sentAt', header: 'Sent', meta: { class: { td: 'whitespace-nowrap' } }, cell: ({ row }) => when(row.original.sentAt) },
  { accessorKey: 'error', header: 'Error', meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} text-sm text-muted` } } },
]

const dailyColumns: TableColumn<DailyCount>[] = [
  {
    id: 'day',
    header: 'Day',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.day),
      // Below sm the type is hidden: shown here instead, so a phone keeps the outcome and the
      // count in view without losing what it said (issue 922).
      h('div', { class: 'sm:hidden font-mono text-xs text-muted' }, row.original.type),
    ]),
  },
  { accessorKey: 'type', header: 'Type', meta: { class: { th: HIDE_BELOW_SM, td: `${HIDE_BELOW_SM} font-mono text-sm` } } },
  { id: 'status', header: 'Outcome', cell: ({ row }) => saysNotificationStatus(row.original.status) },
  { id: 'count', header: 'Count', meta: RIGHT_ALIGNED, cell: ({ row }) => String(row.original.count) },
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
      <UTable
        :data="daily"
        :columns="dailyColumns"
        data-test="daily-counts-table"
      >
        <template #empty>
          <p class="py-6 text-center text-sm text-muted">
            Nothing sent in this window.
          </p>
        </template>
      </UTable>
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
