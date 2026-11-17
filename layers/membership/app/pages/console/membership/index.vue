<!-- Members (tab 5, "Members"): one row per membership with the person, their number, the scheme,
     the status worked out from today, and until when. Current memberships are the default view.
     Search finds a member number, or a person by name or address. -->
<script setup lang="ts">
import { membersList } from '../../../../shared/lists'

definePageMeta({ layout: 'console' })

type Status = 'current' | 'in-grace' | 'upcoming' | 'lapsed' | 'ended'
interface Row { id: string, accountId: string, name: string, number: string | null, scheme: string, status: Status, until: string | null, joined: number }

const { t } = useT()
const { day } = useDates()
const TONES = { 'current': 'success', 'in-grace': 'warning', 'upcoming': 'info', 'lapsed': 'neutral', 'ended': 'neutral' } as const

const list = computed(() => ({
  ...membersList,
  filters: {
    status: { ...membersList.filters.status, label: t('membership.members.column.status'), options: membersList.filters.status.options.map(o => ({ value: o.value, label: t(`membership.members.status.${o.value}`) })) },
    scheme: { ...membersList.filters.scheme, label: t('membership.members.column.scheme') },
  },
  sorts: { joined: { ...membersList.sorts.joined, label: t('membership.members.column.joined') } },
  columns: Object.fromEntries(Object.entries(membersList.columns).map(([key, c]) => [key, { ...c, label: t(`membership.members.column.${key}`) }])),
  views: Object.fromEntries(Object.entries(membersList.views).map(([key, v]) => [key, { ...v, label: t(`membership.members.view.${key}`) }])),
}))
</script>

<template>
  <PageList
    :title="t('membership.navigation.members.label')"
    route="/api/membership/members"
    :list="list"
    :row-label="(row: Row) => t('membership.members.row', { name: row.name, scheme: row.scheme })"
    :row-to="(row: Row) => `/console/membership/memberships/${encodeURIComponent(row.id)}`"
    :empty="{ title: t('membership.members.empty.title'), description: t('membership.members.empty.description'), icon: 'i-lucide-users' }"
  >
    <template #cell-number="{ row }">
      <span class="font-mono">{{ row.number ?? '' }}</span>
    </template>
    <template #cell-status="{ row }">
      <StatusBadge
        :tone="TONES[row.status as Status]"
        :label="t(`membership.members.status.${row.status}`)"
      />
    </template>
    <template #cell-until="{ row }">
      {{ row.until ? day(row.until) : t('membership.members.no-end') }}
    </template>
    <template #cell-joined="{ row }">
      {{ day(row.joined) }}
    </template>
  </PageList>
</template>
