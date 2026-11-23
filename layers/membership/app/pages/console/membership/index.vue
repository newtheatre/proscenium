<!-- Members (tab 5, "Members"): one row per membership with the person, their number, the scheme,
     the status worked out from today, and until when. Current memberships are the default view.
     Search finds a member number, or a person by name or address. The view on screen exports as a
     CSV file for holders of membership.membership.export (MEM-27). Applications waiting on staff
     are drawn above the rows. -->
<script setup lang="ts">
import { membersList } from '../../../../shared/lists'
import type { MembershipSchemeChoice } from '../../../../shared/scheme-choice'

definePageMeta({ layout: 'console' })

type Status = 'current' | 'in-grace' | 'upcoming' | 'lapsed' | 'ended'
interface Row { id: string, accountId: string, name: string, number: string | null, scheme: string, status: Status, until: string | null, joined: string }

const { t } = useT()
const { day } = useDates()
const access = await useAPI<{ canExport: boolean }>('/api/membership/members/access', { key: 'membership:members:access', default: () => ({ canExport: false }) })
const { data: choices } = await useAPI<{ schemes: MembershipSchemeChoice[] }>('/api/membership/members/schemes', { key: 'membership:members:schemes', default: () => ({ schemes: [] }) })
const canAdd = computed(() => !!choices.value?.schemes.some(s => s.canAdd))
const canImport = computed(() => !!choices.value?.schemes.some(s => s.canImport))
const adding = ref(false)
const importing = ref(false)
const reload = () => refreshNuxtData('core:list:/api/membership/members')
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
    export-route="/api/membership/members/export"
    :can-export="access.data.value?.canExport ?? false"
    :empty="{ title: t('membership.members.empty.title'), description: t('membership.members.empty.description'), icon: 'i-lucide-users' }"
  >
    <template #card-description="{ row }">
      <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusBadge
          :tone="TONES[row.status as Status]"
          :label="t(`membership.members.status.${row.status}`)"
        />
        <span>{{ row.until ? t('membership.members.until', { date: day(row.until) }) : t('membership.members.no-end') }}</span>
      </span>
    </template>
    <template #primary>
      <UButton
        v-if="canAdd"
        icon="i-lucide-user-plus"
        :label="t('membership.screens.add-member.title')"
        @click="adding = true"
      />
      <UButton
        v-if="canImport"
        color="neutral"
        variant="outline"
        icon="i-lucide-file-up"
        :label="t('membership.screens.import.action')"
        @click="importing = true"
      />
    </template>
    <template #before>
      <MembershipWaiting @decided="reload" />
    </template>
    <MembershipAddMemberModal
      v-model:open="adding"
      :schemes="choices?.schemes ?? []"
      @added="reload"
    />
    <MembershipImportModal
      v-model:open="importing"
      :schemes="choices?.schemes ?? []"
      @imported="reload"
    />
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
