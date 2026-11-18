<script setup lang="ts">
// Productions (C-01): every production with when it is on, its next performance, where, and its
// state; the season is a filter. "New production" starts a draft in a season, the one on now or
// the next to come by default, and opens it.
import { productionInput } from '../../../../../server/programme/input'

interface Row {
  id: string
  title: string
  kind: string
  state: 'draft' | 'published' | 'withdrawn' | 'cancelled'
  seasonId: string | null
  companyName: string | null
  firstStartsAt: number | null
  lastEndsAt: number | null
  next: { startsAt: number, space: string } | null
  space: string | null
}
interface Season { id: string, name: string, startsOn: string, endsOn: string, state: string }

const { t } = useT()
const { $api } = useNuxtApp()
const { range, dateTime, toLocal } = useDates()
const { data: seasons } = await useAPI<{ rows: Season[] }>('/api/core/seasons', { key: 'core:seasons:picker', query: { size: 100 } })
const columns = [
  { key: 'title', label: 'Production', sortable: true, card: true },
  { key: 'dates', label: 'Dates', sortable: true, sortType: 'date' as const, card: true },
  { key: 'next', label: 'Next performance' },
  { key: 'space', label: 'Space' },
  { key: 'state', label: 'State', card: true },
]
const filters = computed(() => [
  { name: 'state', label: 'State', primary: true, options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'withdrawn', label: 'Withdrawn' }, { value: 'cancelled', label: 'Cancelled' }] },
  { name: 'seasonId', label: 'Season', primary: true, options: (seasons.value?.rows ?? []).map(s => ({ value: s.id, label: s.name })) },
])
const KINDS = [{ value: 'own', label: 'Our own production' }, { value: 'visiting', label: 'A visiting company' }, { value: 'hire', label: 'A hire' }, { value: 'event', label: 'An event, such as a workshop' }]
const TONES = { draft: 'neutral', published: 'success', withdrawn: 'warning', cancelled: 'danger' } as const

// The season a new production most likely belongs to: the one on today, else the next to start.
const NONE = '__none'
const today = toLocal(Date.now()).slice(0, 10) // not-policy: the date part of a local date and time
const openSeasons = computed(() => (seasons.value?.rows ?? []).filter(s => s.state !== 'archived'))
const likelySeason = computed(() => {
  const now = openSeasons.value.find(s => s.startsOn <= today && s.endsOn >= today)
  const next = openSeasons.value.filter(s => s.startsOn > today).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0]
  return (now ?? next)?.id ?? NONE
})

// A short form, so it opens as a panel over the list, checked by the schema the server uses.
const creating = ref(false)
const fields = computed(() => [
  { name: 'title', label: 'Title', kind: 'text' as const },
  { name: 'kind', label: 'What it is', kind: 'radio' as const, options: KINDS },
  ...(openSeasons.value.length
    ? [{ name: 'seasonId', label: 'Season', kind: 'select' as const, help: 'You can change it later on Details.', options: [...openSeasons.value.map(s => ({ value: s.id, label: s.name })), { value: NONE, label: 'No season' }] }]
    : []),
])
const create = (values: Record<string, unknown>) => $api<{ id: string }>('/api/core/productions', {
  method: 'POST',
  body: { title: values.title, kind: values.kind, seasonId: !values.seasonId || values.seasonId === NONE ? null : values.seasonId },
})
const created = (result: unknown) => navigateTo(`/console/programme/productions/${(result as { id: string }).id}`)
</script>

<template>
  <PageList
    title="Productions"
    route="/api/core/productions"
    :columns="columns"
    :filters="filters"
    :row-label="(row: Row) => row.title"
    :row-to="(row: Row) => `/console/programme/productions/${row.id}`"
    :empty="{ title: 'No productions yet', description: 'A production is anything the theatre puts in front of people: its own show, a visiting company, a hire or an event.', icon: 'i-lucide-drama' }"
  >
    <template #primary>
      <UButton
        label="New production"
        icon="i-lucide-plus"
        @click="creating = true"
      />
    </template>
    <template #cell-title="{ row }">
      <span>{{ row.title }}</span>
      <span
        v-if="row.companyName"
        class="text-sm text-muted"
      > · {{ row.companyName }}</span>
    </template>
    <template #cell-dates="{ row }">
      <span v-if="row.firstStartsAt && row.lastEndsAt">{{ range(row.firstStartsAt, row.lastEndsAt) }}</span>
      <span
        v-else
        class="text-muted"
      >No dates yet</span>
    </template>
    <template #cell-next="{ row }">
      <span v-if="row.next">{{ dateTime(row.next.startsAt) }}</span>
      <span
        v-else
        class="text-muted"
      >None to come</span>
    </template>
    <template #cell-space="{ row }">
      {{ row.space ?? '' }}
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
      saved-title="Production created"
      :schema="productionInput"
      :fields="fields"
      :initial="{ title: '', kind: 'own', seasonId: likelySeason }"
      :submit="create"
      @saved="created"
    />
  </PageList>
</template>
