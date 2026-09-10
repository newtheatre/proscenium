<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { formatLondon } from '#shared/utils/london'
import type { PersonHistoryRow } from '#shared/utils/notification-log'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Send history', middleware: 'console' })

const UBadge = resolveComponent('UBadge')

const route = useRoute()
const id = route.params.id as string

interface History {
  account: { id: string, name: string }
  history: { items: PersonHistoryRow[], page: number, pageSize: number, total: number, pages: number }
}

const page = ref(1)
const listing = ref<History | null>(null)
const loading = ref(false)
const failure = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<History>(`/api/admin/comms/accounts/${id}/history`, { query: { page: page.value } })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

watch(page, load)

const when = (at: number | null): string => at ? formatLondon(new Date(at * 1000), { dateStyle: 'medium', timeStyle: 'short' }) : 'Not sent'

const columns: TableColumn<PersonHistoryRow>[] = [
  { accessorKey: 'type', header: 'Type', meta: { class: { td: 'font-mono text-sm' } } },
  { accessorKey: 'channel', header: 'Channel' },
  {
    id: 'status',
    header: 'Outcome',
    cell: ({ row }) => h(UBadge, { variant: 'subtle', size: 'sm' }, () => row.original.status),
  },
  { id: 'createdAt', header: 'Enqueued', cell: ({ row }) => formatLondon(new Date(row.original.createdAt * 1000), { dateStyle: 'medium', timeStyle: 'short' }) },
  { id: 'sentAt', header: 'Sent', cell: ({ row }) => when(row.original.sentAt) },
]

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <UButton
      to="/comms/operations"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      class="p-0"
    >
      Back to the send log
    </UButton>

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <h1
      v-if="listing"
      class="text-lg font-semibold"
      data-test="history-name"
    >
      {{ listing.account.name }}
    </h1>

    <p class="text-sm text-muted">
      Types, dates and outcomes only. Never a message body, which might carry somebody else's data.
    </p>

    <UTable
      :data="listing?.history.items ?? []"
      :columns="columns"
      :loading="loading"
      data-test="history-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          Nothing sent to this account yet.
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="history-total"
        class="text-sm text-muted"
      >
        {{ plural(listing?.history.total ?? 0, 'send') }}
      </p>
      <UPagination
        v-if="listing && listing.history.pages > 1"
        v-model:page="page"
        :total="listing.history.total"
        :items-per-page="listing.history.pageSize"
      />
    </div>
  </div>
</template>
