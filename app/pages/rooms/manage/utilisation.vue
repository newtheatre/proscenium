<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { saysShare, usedShare } from '#shared/utils/utilisation'
import type { UtilisationRow } from '#shared/utils/utilisation'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
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
const by = ref<'room' | 'tier'>('room')
const page = ref(1)
const search = ref('')
const report = ref<Report | null>(null)
const loading = ref(false)
const failure = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    report.value = await $fetch<Report>('/api/admin/rooms/reports/utilisation', {
      query: { from: span.from, to: span.to, by: by.value, page: page.value },
    })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

const shown = computed(() => {
  const items = report.value?.items ?? []
  const term = search.value.trim().toLowerCase()
  return term ? items.filter(item => item.label.toLowerCase().includes(term)) : items
})

const exportUrl = computed(() =>
  `/api/admin/rooms/reports/export?${new URLSearchParams({ from: span.from, to: span.to, by: by.value })}`)

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (by.value !== 'room') {
    active.push({ key: 'by', label: 'By tier', icon: 'i-lucide-layers', clear: () => {
      by.value = 'room'
    } })
  }
  return active
})

watch([() => span.from, () => span.to, by], () => {
  page.value = 1
  void load()
})
watch(page, load)

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

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
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
      :active="activeFilters"
      :loading="loading"
      @clear="search = ''; by = 'room'"
    >
      <template #filters>
        <UFormField label="Break down by">
          <USelect
            v-model="by"
            data-test="report-by"
            :items="[{ label: 'Room', value: 'room' }, { label: 'Kind of booking', value: 'tier' }]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
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
      :data="shown"
      :columns="columns"
      :loading="loading"
      data-test="utilisation-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          Nothing was booked in that span.
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="utilisation-totals"
        class="text-sm text-muted"
      >
        {{ report?.totals.confirmedHours ?? 0 }}h used across
        {{ plural(report?.totals.bookings ?? 0, 'booking') }},
        {{ report?.totals.noShowHours ?? 0 }}h not turned up to.
      </p>
      <UPagination
        v-if="report && report.pages > 1"
        v-model:page="page"
        :total="report.total"
        :items-per-page="report.pageSize"
      />
    </div>
  </div>
</template>
