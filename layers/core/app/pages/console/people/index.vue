<!-- Accounts (Identity Doc part 5, console People): everyone, searched by name or verified address
     and filtered by state. Unclaimed and erased accounts are hidden unless looked for, through the
     state filter or the views. -->
<script setup lang="ts">
import { accountsList } from '../../../../shared/identity-lists'

definePageMeta({ layout: 'console' })

type State = 'active' | 'unclaimed' | 'disabled' | 'anonymised'
interface Row { id: string, name: string | null, preferredName: string | null, since: number, state: State }

const { t } = useT()
const { day } = useDates()

const TONES = { active: 'success', unclaimed: 'neutral', disabled: 'warning', anonymised: 'neutral' } as const
const stateLabel = (state: State) => t(`core.people.state.${state}`)

// The declaration with the theatre's own words in place of its English fallbacks.
const list = computed(() => ({
  ...accountsList,
  filters: {
    state: {
      ...accountsList.filters.state,
      label: t('core.people.column.state'),
      options: accountsList.filters.state.options.map(o => ({ value: o.value, label: stateLabel(o.value as State) })),
    },
  },
  sorts: { name: { ...accountsList.sorts.name, label: t('core.people.column.name') } },
  columns: Object.fromEntries(Object.entries(accountsList.columns).map(([key, c]) => [key, { ...c, label: t(`core.people.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(accountsList.views).map(([key, v]) => [key, { ...v, label: t(`core.people.view.${key}`) }])),
}))

const label = (row: Row) => row.state === 'anonymised' ? t('core.people.erased') : (row.name ?? t('core.people.unnamed'))
</script>

<template>
  <PageList
    :title="t('core.navigation.people.label')"
    route="/api/core/people"
    :list="list"
    :row-label="label"
    :row-to="(row: Row) => `/console/people/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('core.people.empty.title'), description: t('core.people.empty.description'), icon: 'i-lucide-users' }"
  >
    <template #cell-name="{ row }">
      <span>{{ label(row) }}</span>
      <span
        v-if="row.preferredName && row.preferredName !== row.name"
        class="text-sm text-muted"
      > · {{ row.preferredName }}</span>
    </template>
    <template #cell-preferredName="{ row }">
      {{ row.preferredName }}
    </template>
    <template #cell-state="{ row }">
      <StatusBadge
        :tone="TONES[row.state as State]"
        :label="stateLabel(row.state)"
      />
    </template>
    <template #cell-since="{ row }">
      {{ day(row.since) }}
    </template>
  </PageList>
</template>
