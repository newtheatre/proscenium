<!-- My loans (S14, INV-27): the kit I have asked for, borrowed and returned, newest first. -->
<script setup lang="ts">
import type { LoanRow } from '../../../../../shared/loans'

const { t } = useT()
const { range } = useDates()
const { data, status, error, refresh } = await useAPI<{ loans: LoanRow[] }>('/api/inventory/my/loans', { key: 'inventory:my-loans' })
const describe = (l: LoanRow) => [t(`inventory.loan-states.${l.state}`), range(l.startsAt, l.dueBackOn), t('inventory.loans.lines', { count: l.lines })].join(' · ')
</script>

<template>
  <PageFrame
    :title="t('inventory.borrow.my-loans')"
    :trail="[{ label: t('inventory.borrow.title'), to: '/members/kit' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.loans.length"
        icon="i-lucide-hand-helping"
        :title="t('inventory.borrow.no-loans')"
      />
      <RecordList
        v-else
        :label="t('inventory.borrow.my-loans')"
      >
        <RecordListItem
          v-for="l in data.loans"
          :key="l.id"
          :to="`/members/kit/loans/${l.id}`"
          icon="i-lucide-package"
          :name="l.department"
          :description="describe(l)"
          :muted="['returned', 'declined', 'cancelled'].includes(l.state)"
        />
      </RecordList>
    </DataBoundary>
  </PageFrame>
</template>
