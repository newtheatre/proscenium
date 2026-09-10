<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatLondon } from '#shared/utils/london'
import { CHANNELS, NOTIFICATION_STATUSES, NOTIFICATION_TOPICS, TOPIC_LABELS } from '#shared/utils/notifications'
import type { DailyCount, SendLogRow } from '#shared/utils/notification-log'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
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

const listing = ref<Listing | null>(null)
const type = ref('')
const topic = ref<(typeof NOTIFICATION_TOPICS)[number] | undefined>(undefined)
const channel = ref<(typeof CHANNELS)[number] | undefined>(undefined)
const status = ref<(typeof NOTIFICATION_STATUSES)[number] | undefined>(undefined)
const from = ref('')
const to = ref('')
const page = ref(1)
const loading = ref(false)
const failure = ref<string | null>(null)

const daily = ref<DailyCount[] | null>(null)

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<Listing>('/api/admin/comms/send-log', {
      query: {
        type: type.value || undefined,
        topic: topic.value,
        channel: channel.value,
        status: status.value,
        from: from.value || undefined,
        to: to.value || undefined,
        page: page.value,
      },
    })
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

watch([topic, channel, status, from, to], () => {
  page.value = 1
  void load()
})
watch(page, load)
watch(type, () => {
  page.value = 1
  void load()
})

function clearFilters(): void {
  type.value = ''
  topic.value = undefined
  channel.value = undefined
  status.value = undefined
  from.value = ''
  to.value = ''
  page.value = 1
  void load()
}

function clearType(): void {
  type.value = ''
}
function clearTopic(): void {
  topic.value = undefined
}
function clearChannel(): void {
  channel.value = undefined
}
function clearStatus(): void {
  status.value = undefined
}
function clearRange(): void {
  from.value = ''
  to.value = ''
}

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (type.value) {
    active.push({ key: 'type', label: `Type ${type.value}`, icon: 'i-lucide-tag', clear: clearType })
  }
  if (topic.value) {
    active.push({ key: 'topic', label: TOPIC_LABELS[topic.value], icon: 'i-lucide-layers', clear: clearTopic })
  }
  if (channel.value) {
    active.push({ key: 'channel', label: channel.value, icon: 'i-lucide-radio', clear: clearChannel })
  }
  if (status.value) {
    active.push({ key: 'status', label: status.value, icon: 'i-lucide-flag', clear: clearStatus })
  }
  if (from.value || to.value) {
    active.push({ key: 'range', label: `${from.value || 'start'} to ${to.value || 'now'}`, icon: 'i-lucide-calendar', clear: clearRange })
  }
  return active
})

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
      v-model:search="type"
      placeholder="A message type, such as shift.reminder"
      :active="activeFilters"
      :loading="loading"
      @clear="clearFilters"
    >
      <template #filters>
        <UFormField label="Topic">
          <USelect
            v-model="topic"
            data-test="filter-topic"
            :items="[{ label: 'Any topic', value: undefined }, ...NOTIFICATION_TOPICS.map(value => ({ label: TOPIC_LABELS[value], value }))]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Channel">
          <USelect
            v-model="channel"
            data-test="filter-channel"
            :items="[{ label: 'Any channel', value: undefined }, ...CHANNELS.map(value => ({ label: value, value }))]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Outcome">
          <USelect
            v-model="status"
            data-test="filter-status"
            :items="[{ label: 'Any outcome', value: undefined }, ...NOTIFICATION_STATUSES.map(value => ({ label: value, value }))]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="From">
          <DateField
            v-model="from"
            data-test="filter-from"
          />
        </UFormField>
        <UFormField label="To">
          <DateField
            v-model="to"
            data-test="filter-to"
          />
        </UFormField>
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
          {{ activeFilters.length ? 'Nothing matches that.' : 'Nothing sent yet.' }}
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
