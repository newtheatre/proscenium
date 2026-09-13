<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysShare, usedShare } from '#shared/utils/utilisation'
import { utilisationList } from '#shared/utils/utilisation-list'
import type { UtilisationRow } from '#shared/utils/utilisation'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Utilisation', middleware: 'console' })

const UBadge = resolveComponent('UBadge')

interface Report {
  from: string
  to: string
  by: string
  items: UtilisationRow[]
  page: number
  pageSize: number
  total: number
  pages: number
  totals: Omit<UtilisationRow, 'key' | 'label'>
}

// The committee year to date, which is the span a review is actually written about (0009).
function yearToDate(): { from: string, to: string } {
  const now = new Date()
  const august = new Date(Date.UTC(now.getUTCFullYear(), 7, 1))
  const start = now >= august ? august : new Date(Date.UTC(now.getUTCFullYear() - 1, 7, 1))
  return { from: start.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
}

const span = reactive(yearToDate())

// The breakdown, search, sort and page live in the URL (K-129); the span does not, because it is
// a report parameter rather than a filter over a fixed set of rows.
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(utilisationList)

const by = computed<'room' | 'tier'>(() => (conditions.value.find(condition => condition.key === 'by')?.values[0] as 'room' | 'tier' | undefined) ?? 'room')

const empty = (): Report => ({ from: span.from, to: span.to, by: 'room', items: [], page: 1, pageSize: 0, total: 0, pages: 1, totals: { confirmedHours: 0, cancelledHours: 0, noShowHours: 0, openHours: 0, bookings: 0 } })

const request = useRequestFetch()
const { data: report, status, error } = await useAsyncData(
  'rooms-utilisation',
  () => request<Report>('/api/admin/rooms/reports/utilisation', { query: { ...query.value, from: span.from, to: span.to } }),
  { watch: [query, () => span.from, () => span.to], default: empty },
)
const failure = useListFailure(error, 'The utilisation report could not be read.')

// A span change is not a URL filter, so it resets the page itself.
watch([() => span.from, () => span.to], () => {
  page.value = 1
})

const exportUrl = computed(() =>
  `/api/admin/rooms/reports/export?${new URLSearchParams({ from: span.from, to: span.to, by: by.value })}`)

const columns = computed<TableColumn<UtilisationRow>[]>(() => [
  { accessorKey: 'label', header: by.value === 'room' ? 'Room' : 'Kind' },
  {
    id: 'used',
    header: 'Used',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
      h('span', { class: 'font-medium' }, `${row.original.confirmedHours}h`),
      h(UBadge, {
        color: usedShare(row.original) === null ? 'neutral' : 'primary',
        variant: 'subtle',
        size: 'sm',
      }, () => saysShare(row.original)),
    ]),
  },
  {
    id: 'open',
    header: 'Open',
    cell: ({ row }) => (row.original.openHours > 0 ? `${row.original.openHours}h` : 'Always open'),
  },
  {
    id: 'lost',
    header: 'Not used',
    cell: ({ row }) => h('div', { class: 'text-sm' }, [
      h('div', {}, `${row.original.cancelledHours}h cancelled`),
      h('div', { class: row.original.noShowHours > 0 ? 'text-warning' : 'text-muted' },
        `${row.original.noShowHours}h not turned up to`),
    ]),
  },
  { accessorKey: 'bookings', header: 'Bookings', meta: { class: { td: 'text-sm text-muted' } } },
])
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="load-failed"
      color="error"
      variant="subtle"
      icon="i-lucide-unplug"
      :title="failure.message"
      description="This is not the same as nothing being asked for. Reload, and if it keeps happening say so."
      :actions="failure.enrolPath ? [{ label: 'Set up an authenticator app', to: failure.enrolPath, color: 'error' }] : []"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-chart-column"
      title="Booked hours against the hours a room is open"
      description="A room with no opening hours recorded is always open, so there is no denominator to divide by and it reads as such rather than as nought per cent."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A room or a kind"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="utilisationList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
        <UFormField label="From">
          <DateField
            v-model="span.from"
            data-test="report-from"
          />
        </UFormField>
        <UFormField label="Until">
          <DateField
            v-model="span.to"
            data-test="report-to"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="report-export"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
          :to="exportUrl"
          external
        >
          Export
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="report.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="utilisation-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ failure ? 'The utilisation report could not be read.' : filtered ? 'Nothing matches that.' : 'Nothing was booked in that span.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="utilisation-totals"
        class="text-sm text-muted"
      >
        {{ report.totals.confirmedHours }}h used across
        {{ plural(report.totals.bookings, 'booking') }},
        {{ report.totals.noShowHours }}h not turned up to.
      </p>
      <UPagination
        v-if="report.pages > 1"
        v-model:page="page"
        :total="report.total"
        :items-per-page="report.pageSize"
      />
    </div>
  </div>
</template>
