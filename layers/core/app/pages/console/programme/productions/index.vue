<script setup lang="ts">
// Productions (C-01): every production, with its state and season. "New production" starts a draft
// and opens it. Dates, and so the next performance, arrive with performances.
import { productionInput } from '../../../../../server/programme/input'

interface Row { id: string, title: string, kind: string, state: 'draft' | 'published' | 'withdrawn' | 'cancelled', seasonId: string | null, companyName: string | null }

const { t } = useT()
const { $api } = useNuxtApp()
const { data: seasons } = await useAPI<{ rows: { id: string, name: string }[] }>('/api/core/seasons', { key: 'core:seasons:picker', query: { size: 100 } })
const columns = [
  { key: 'title', label: 'Production', sortable: true, card: true },
  { key: 'season', label: 'Season', card: true },
  { key: 'state', label: 'State', card: true },
]
const filters = computed(() => [
  { name: 'state', label: 'State', primary: true, options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'withdrawn', label: 'Withdrawn' }, { value: 'cancelled', label: 'Cancelled' }] },
  { name: 'seasonId', label: 'Season', primary: true, options: (seasons.value?.rows ?? []).map(s => ({ value: s.id, label: s.name })) },
])
const KINDS = [{ value: 'own', label: 'Our own production' }, { value: 'visiting', label: 'A visiting company' }, { value: 'hire', label: 'A hire' }, { value: 'event', label: 'An event, such as a workshop' }]
const TONES = { draft: 'neutral', published: 'success', withdrawn: 'warning', cancelled: 'danger' } as const
const seasonName = (id: string | null) => seasons.value?.rows.find(s => s.id === id)?.name ?? ''

// A short form, so it opens as a panel over the list, checked by the schema the server uses.
const creating = ref(false)
const fields = [
  { name: 'title', label: 'Title', kind: 'text' as const },
  { name: 'kind', label: 'What it is', kind: 'radio' as const, options: KINDS },
]
const create = (values: Record<string, unknown>) => $api<{ id: string }>('/api/core/productions', { method: 'POST', body: { title: values.title, kind: values.kind } })
const created = (result: unknown) => navigateTo(`/console/programme/productions/${(result as { id: string }).id}`)

// The palette's actions arrive here: ?new=1 opens New production; ?run=1 asks which production a
// run is for, and each row then opens that production's Dates with Add a run.
const route = useRoute()
const choosingForRun = computed(() => route.query.run === '1')
onMounted(() => {
  if (route.query.new !== '1') return
  creating.value = true
  const { new: _, ...rest } = route.query
  void navigateTo({ query: rest }, { replace: true })
})
const rowTo = (row: Row) => choosingForRun.value ? `/console/programme/productions/${row.id}?tab=dates&run=1` : `/console/programme/productions/${row.id}`
</script>

<template>
  <PageList
    title="Productions"
    route="/api/core/productions"
    :columns="columns"
    :filters="filters"
    :row-label="(row: Row) => row.title"
    :row-to="rowTo"
    :empty="{ title: 'No productions yet', description: 'A production is anything the theatre puts in front of people: its own show, a visiting company, a hire or an event.', icon: 'i-lucide-drama' }"
  >
    <template #primary>
      <UButton
        label="New production"
        icon="i-lucide-plus"
        @click="creating = true"
      />
    </template>
    <template
      v-if="choosingForRun"
      #before
    >
      <UAlert
        icon="i-lucide-calendar-plus"
        title="Which production is the run for?"
        description="Choose one below and its dates open with Add a run."
        close
        @update:open="navigateTo({ query: { ...route.query, run: undefined } }, { replace: true })"
      />
    </template>
    <template #cell-title="{ row }">
      <span>{{ row.title }}</span>
      <span
        v-if="row.companyName"
        class="text-sm text-muted"
      > · {{ row.companyName }}</span>
    </template>
    <template #cell-season="{ row }">
      {{ seasonName(row.seasonId) }}
    </template>
    <template #cell-state="{ row }">
      <StatusBadge
        :tone="TONES[row.state as Row['state']]"
        :label="t(`core.states.${row.state}`)"
      />
    </template>

    <PageForm
      v-model:open="creating"
      title="New production"
      description="It starts as a draft. Nothing is public until you publish it."
      submit-label="Create production"
      :schema="productionInput"
      :fields="fields"
      :initial="{ title: '', kind: 'own' }"
      :submit="create"
      @saved="created"
    />
  </PageList>
</template>
