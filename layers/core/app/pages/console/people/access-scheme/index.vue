<!-- The access scheme's queue (ID-40; identity spec part 6): open applications and changes, oldest
     first, with how long each has waited. Names and states only; needs show once one is opened, and
     opening one is recorded. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Row { accountId: string, name: string | null, change: boolean, submittedVia: 'self' | 'staff', waitingFor: number, overdue: boolean }

const { t } = useT()
const DAY = 86_400_000 // not-policy: milliseconds in a day

const columns = [
  { key: 'name', label: t('core.access.queue.person'), card: true },
  { key: 'change', label: t('core.access.queue.kind'), card: true },
  { key: 'waitingFor', label: t('core.access.queue.waited'), card: true },
]
const filters = [{
  name: 'kind',
  label: t('core.access.queue.kind'),
  primary: true,
  options: [{ value: 'new', label: t('core.access.queue.new') }, { value: 'change', label: t('core.access.queue.change') }],
}]
</script>

<template>
  <PageList
    :title="t('core.navigation.access-scheme-queue.label')"
    route="/api/core/access-scheme"
    row-key="accountId"
    :columns="columns"
    :filters="filters"
    :row-label="(row: Row) => row.name ?? t('core.access.queue.unnamed')"
    :row-to="(row: Row) => `/console/people/access-scheme/${encodeURIComponent(row.accountId)}`"
    :empty="{ title: t('core.access.queue.empty'), description: t('core.access.queue.empty-description'), icon: 'i-lucide-accessibility' }"
  >
    <template #cell-name="{ row }">
      {{ row.name ?? t('core.access.queue.unnamed') }}
    </template>
    <template #cell-change="{ row }">
      {{ row.change ? t('core.access.queue.change') : t('core.access.queue.new') }}<span
        v-if="row.submittedVia === 'staff'"
        class="text-muted"
      > · {{ t('core.access.queue.by-staff') }}</span>
    </template>
    <template #cell-waitingFor="{ row }">
      <span class="inline-flex items-center gap-2">
        {{ t('core.access.queue.days', { count: Math.floor(row.waitingFor / DAY) }) }}
        <StatusBadge
          v-if="row.overdue"
          tone="warning"
          :label="t('core.access.queue.overdue')"
        />
      </span>
    </template>
  </PageList>
</template>
