<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { formatLondon } from '#shared/utils/london'
import type { Page } from '#shared/utils/pagination'

definePageMeta({ layout: 'console', title: 'Ledger entries', middleware: 'console' })

interface SeasonEntry { id: string, happenedAt: number, source: string, tender: string, totalPence: number }

const route = useRoute()
const request = useRequestFetch()
const page = ref(1)

const query = computed(() => ({ ...route.query, page: page.value }))

const { data, status, error } = await useAsyncData(
  'season-entries',
  () => request<Page<SeasonEntry>>('/api/admin/finance/season/entries', { query: query.value }),
  { watch: [query], default: () => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 }) },
)

const entriesFailure = computed(() => (error.value ? refusalText(error.value, 'The entries could not be read.') : null))
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="entriesFailure"
      data-test="entries-failure"
      color="error"
      variant="subtle"
      :description="entriesFailure"
    />

    <template v-else-if="status !== 'pending' && data">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b text-left text-muted">
            <th class="py-2">
              When
            </th><th>Source</th><th>Tender</th><th>Pence</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in data.items"
            :key="entry.id"
            data-test="entry-row"
          >
            <td class="py-2">
              {{ formatLondon(new Date(entry.happenedAt * 1000), { dateStyle: 'short', timeStyle: 'short' }) }}
            </td>
            <td>{{ entry.source }}</td>
            <td>{{ entry.tender }}</td>
            <td>{{ saysMoney(entry.totalPence) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="flex items-center justify-between">
        <span class="text-sm text-muted">{{ data.total }} entries</span>
        <UPagination
          v-model:page="page"
          :total="data.total"
          :items-per-page="data.pageSize"
        />
      </div>
    </template>
  </div>
</template>
