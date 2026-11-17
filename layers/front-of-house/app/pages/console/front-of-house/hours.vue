<!-- Volunteer hours (Front of house specification, part 5, "Console"): for a range of the theatre's
     days, each person's shifts worked, hours and no-shows, with the total. Export gives the same as a
     CSV file. The range is kept in the address. Reading it is audited. -->
<script setup lang="ts">
interface Row {
  accountId: string
  name: string
  shiftsWorked: number
  minutes: number
  noShows: number
}

const { t } = useT()
const route = useRoute()
const router = useRouter()

// The current calendar year by default.
const year = new Date().getFullYear()
const range = computed({
  get: () => ({ start: (route.query.from as string | undefined) ?? `${year}-01-01`, end: (route.query.to as string | undefined) ?? `${year}-12-31` }),
  set: (v: { start: string, end: string }) => {
    if (v.start && v.end) void router.replace({ query: { ...route.query, from: v.start, to: v.end } })
  },
})
const query = computed(() => ({ fromDay: range.value.start, toDay: range.value.end }))
const { data, status, error, refresh } = await useAPI<{ rows: Row[], totalMinutes: number }>('/api/front-of-house/hours', { key: 'front-of-house:hours', query })
const exportTo = computed(() => `/api/front-of-house/hours/export?${new URLSearchParams(query.value).toString()}`)

const hours = (minutes: number) => t('front-of-house.hours.count', { count: Math.round(minutes / 6) / 10 }) // not-policy: hours to one decimal place
const columns = computed(() => [
  { accessorKey: 'name', header: t('front-of-house.hours.person') },
  { accessorKey: 'shiftsWorked', header: t('front-of-house.hours.shifts') },
  { id: 'hours', header: t('front-of-house.hours.hours') },
  { accessorKey: 'noShows', header: t('front-of-house.hours.no-shows') },
])
</script>

<template>
  <PageFrame
    :title="t('front-of-house.navigation.hours.label')"
    :description="t('front-of-house.hours.description')"
  >
    <template #primary>
      <UButton
        :to="exportTo"
        external
        download
        icon="i-lucide-download"
        color="neutral"
        variant="outline"
        :label="t('front-of-house.hours.export')"
      />
    </template>
    <UFormField
      :label="t('front-of-house.hours.range')"
      class="mb-6"
    >
      <FieldDateRange v-model="range" />
    </UFormField>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-6">
          <FactStrip
            :facts="[
              { label: t('front-of-house.hours.people'), value: String(d.rows.length) },
              { label: t('front-of-house.hours.total'), value: hours(d.totalMinutes) },
            ]"
          />
          <EmptyState
            v-if="!d.rows.length"
            :title="t('front-of-house.hours.empty.title')"
            :description="t('front-of-house.hours.empty.description')"
            icon="i-lucide-clock"
          />
          <UTable
            v-else
            :data="d.rows"
            :columns="columns"
            :caption="t('front-of-house.navigation.hours.label')"
          >
            <template #hours-cell="{ row }">
              {{ hours(row.original.minutes) }}
            </template>
          </UTable>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
