<script setup lang="ts">
// Productions (C-01): every production with when it is on, its next performance, where, and its
// state; the season is a filter. It opens on what is coming up, soonest first, with Drafts, Past and
// All as views. "New production" starts a draft in a season, the one on now or the next to come by
// default, with its usual space, and opens it.
import { defineList } from '../../../../../shared/list'
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
const list = defineList('core.productions', {
  filters: {
    state: { kind: 'choice', label: 'State', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'withdrawn', label: 'Withdrawn' }, { value: 'cancelled', label: 'Cancelled' }] },
    seasonId: { kind: 'choice', label: 'Season', options: [] },
  },
  sorts: { title: { label: 'Production', type: 'text' }, dates: { label: 'Dates', type: 'date' } },
  columns: {
    title: { label: 'Production', sort: 'title', card: true, always: true },
    dates: { label: 'Dates', sort: 'dates', card: true },
    next: { label: 'Next performance' },
    space: { label: 'Space' },
    state: { label: 'State', card: true },
  },
  // The route narrows and orders each view; Drafts also says so in the State filter.
  views: {
    'coming-up': { label: 'Coming up', sort: 'dates', order: 'asc' },
    'drafts': { label: 'Drafts', filters: { state: 'draft' } },
    'past': { label: 'Past', sort: 'dates', order: 'desc' },
    'all': { label: 'All' },
  },
  defaultView: 'coming-up',
})
const seasonOptions = computed(() => ({ seasonId: (seasons.value?.rows ?? []).map(s => ({ value: s.id, label: s.name })) }))
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

// Its usual space: the only one there is, else the one its season's latest production used.
const { data: placing } = await useAPI<{ spaces: { id: string, label: string }[], suggested: Record<string, string | null>, withoutSeason: string | null }>('/api/core/productions/space-options', { key: 'core:productions:space-options', default: () => ({ spaces: [], suggested: {}, withoutSeason: null }) })
const likelySpace = computed(() => (likelySeason.value === NONE ? placing.value?.withoutSeason : placing.value?.suggested[likelySeason.value]) ?? NONE)

// A short form, so it opens as a panel over the list, checked by the schema the server uses.
const creating = ref(false)
const fields = computed(() => [
  { name: 'title', label: 'Title', kind: 'text' as const },
  { name: 'kind', label: 'What it is', kind: 'radio' as const, options: KINDS },
  ...(openSeasons.value.length
    ? [{ name: 'seasonId', label: 'Season', kind: 'select' as const, help: 'You can change it later on Details.', options: [...openSeasons.value.map(s => ({ value: s.id, label: s.name })), { value: NONE, label: 'No season' }] }]
    : []),
  ...(placing.value?.spaces.length
    ? [{ name: 'usualSpaceId', label: 'Usual space', kind: 'select' as const, help: 'Where it usually plays: adding dates starts there.', options: [...placing.value.spaces.map(s => ({ value: s.id, label: s.label })), { value: NONE, label: 'Not set' }] }]
    : []),
])
const create = (values: Record<string, unknown>) => $api<{ id: string }>('/api/core/productions', {
  method: 'POST',
  body: { title: values.title, kind: values.kind, seasonId: !values.seasonId || values.seasonId === NONE ? null : values.seasonId, usualSpaceId: !values.usualSpaceId || values.usualSpaceId === NONE ? null : values.usualSpaceId },
})
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
    :list="list"
    :filter-options="seasonOptions"
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
    <template #card-description="{ row }">
      {{ row.companyName }}
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
      :initial="{ title: '', kind: 'own', seasonId: likelySeason, usualSpaceId: likelySpace }"
      :submit="create"
      @saved="created"
    />
  </PageList>
</template>
