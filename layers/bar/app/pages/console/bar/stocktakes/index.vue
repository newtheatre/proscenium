<!-- Stocktakes (S10): counts going on and waiting for approval first, then the latest finished. A
     count is started at a location, of everything or of one category; a row opens it to count, to
     review or as its record. -->
<script setup lang="ts">
type State = 'counting' | 'submitted' | 'approved' | 'abandoned'
interface Stocktake { id: string, location: string, state: State, category: string | null, startedBy: string, startedAt: number, submittedAt: number | null, approvedAt: number | null, varianceValueMinor: number | null }

const { t } = useT()
const router = useRouter()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime } = useDates()
const { toRefusal } = useRefusal()
const { data, status, error, refresh } = await useAPI<{ stocktakes: Stocktake[], locations: { id: string, name: string }[], categories: { id: string, name: string }[], can: { approve: boolean } }>('/api/bar/stocktakes', { key: 'bar:stocktakes' })

const tone = (s: State) => ({ counting: 'info', submitted: 'warning', approved: 'success', abandoned: 'neutral' } as const)[s]
const columns = computed(() => [
  { id: 'when', header: t('bar.screens.stocktakes.started') },
  { accessorKey: 'location', header: t('bar.screens.stocktakes.location') },
  { id: 'scope', header: t('bar.screens.stocktakes.scope') },
  { id: 'difference', header: t('bar.screens.stocktakes.difference') },
  { id: 'state', header: t('bar.screens.stocktakes.state') },
])

// Starting a count: where, and of what.
const EVERYTHING = 'everything'
const starting = ref<{ locationId: string, categoryId: string } | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
function openStart() {
  refusal.value = null
  const locations = data.value?.locations ?? []
  starting.value = { locationId: locations.length === 1 ? locations[0]!.id : '', categoryId: EVERYTHING }
}
const locationItems = computed(() => (data.value?.locations ?? []).map(l => ({ value: l.id, label: l.name })))
const scopeItems = computed(() => [{ value: EVERYTHING, label: t('bar.screens.stocktakes.everything') }, ...(data.value?.categories ?? []).map(c => ({ value: c.id, label: c.name }))])
async function start() {
  const s = starting.value!
  refusal.value = null
  busy.value = true
  try {
    const made = await $api<{ stocktakeId: string }>('/api/bar/stocktakes', { method: 'POST', body: { locationId: s.locationId, categoryId: s.categoryId === EVERYTHING ? null : s.categoryId } })
    starting.value = null
    await router.push(`/console/bar/stocktakes/${made.stocktakeId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <PageFrame :title="t('bar.navigation.stocktakes.label')">
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('bar.screens.stocktakes.start')"
        @click="openStart"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <EmptyState
          v-if="!d.stocktakes.length"
          :title="t('bar.screens.stocktakes.empty.title')"
          :description="t('bar.screens.stocktakes.empty.description')"
          icon="i-lucide-clipboard-list"
        />
        <UTable
          v-else
          :data="d.stocktakes"
          :columns="columns"
          :caption="t('bar.navigation.stocktakes.label')"
        >
          <template #when-cell="{ row }">
            <ULink
              :to="`/console/bar/stocktakes/${row.original.id}`"
              class="font-medium"
            >
              {{ dateTime(row.original.startedAt) }}
            </ULink>
          </template>
          <template #scope-cell="{ row }">
            {{ row.original.category ?? t('bar.screens.stocktakes.everything') }}
          </template>
          <template #difference-cell="{ row }">
            <span class="tabular-nums">{{ row.original.varianceValueMinor === null ? '' : money(row.original.varianceValueMinor) }}</span>
          </template>
          <template #state-cell="{ row }">
            <StatusBadge
              :tone="tone(row.original.state)"
              :label="t(`bar.screens.stocktakes.states.${row.original.state}`)"
            />
          </template>
        </UTable>
      </template>
    </DataBoundary>

    <UModal
      :open="!!starting"
      :title="t('bar.screens.stocktakes.start')"
      @update:open="v => { if (!v) starting = null }"
    >
      <template #body>
        <UForm
          v-if="starting"
          id="bar-stocktake-start"
          :state="starting"
          :validate="() => needs({ locationId: starting!.locationId })"
          class="space-y-4"
          novalidate
          @submit="start"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            :label="t('bar.screens.stocktakes.location')"
            name="locationId"
            required
          >
            <USelect
              v-model="starting.locationId"
              :items="locationItems"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.stocktakes.what')"
            :help="t('bar.screens.stocktakes.what-help')"
            name="categoryId"
          >
            <USelect
              v-model="starting.categoryId"
              :items="scopeItems"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-stocktake-start"
          :loading="busy"
          :label="t('bar.screens.stocktakes.start-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
