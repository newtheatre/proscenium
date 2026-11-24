<!-- Loans (S4): requests, approved, out and overdue in tabs, finished loans below the divider. Each row
     names the borrower, department, window and how many lines. "Lend kit" lends straight away. -->
<script setup lang="ts">
import type { LoanRow } from '../../../../../shared/loans'

interface Loans { loans: LoanRow[], departments: { id: string, name: string }[], lending: { id: string, name: string }[] }

const { t } = useT()
const { range } = useDates()
const { data, status, error, refresh } = await useAPI<Loans>('/api/inventory/loans', { key: 'inventory:loans' })
const loans = computed(() => data.value?.loans)
const { tab, counts, shown, finished, overdue } = useLoanList(loans)
const tabs = computed(() => LOAN_TABS.map(k => ({ value: k, label: t(`inventory.loans.tab.${k}`), badge: counts.value[k] || undefined })))
const actions = computed(() => data.value?.lending.length ? [{ label: t('inventory.loans.lend'), icon: 'i-lucide-plus', to: '/console/inventory/loans/new' }] : [])
const describe = (l: LoanRow) => [l.department, range(l.startsAt, l.dueBackOn), t('inventory.loans.lines', { count: l.lines })].join(' · ')
</script>

<template>
  <PageFrame :title="t('inventory.navigation.loans.label')">
    <template #primary>
      <PageActions
        v-if="actions.length"
        :actions="actions"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <TabStrip>
          <UTabs
            v-model="tab"
            :items="tabs"
            :content="false"
            variant="link"
          />
        </TabStrip>
        <EmptyState
          v-if="!shown.length"
          icon="i-lucide-hand-helping"
          :title="t(`inventory.loans.none.${tab}`)"
        />
        <RecordList
          v-else
          :label="t(`inventory.loans.tab.${tab}`)"
        >
          <RecordListItem
            v-for="l in shown"
            :key="l.id"
            :to="`/console/inventory/loans/${l.id}`"
            icon="i-lucide-hand-helping"
            :name="l.borrower || t('inventory.loans.no-borrower')"
            :description="describe(l)"
          >
            <StatusBadge
              v-if="overdue(l)"
              tone="danger"
              :label="t('inventory.loans.overdue')"
            />
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          :label="t('inventory.loans.finished')"
          :count="finished.length"
        >
          <RecordList :label="t('inventory.loans.finished')">
            <RecordListItem
              v-for="l in finished"
              :key="l.id"
              :to="`/console/inventory/loans/${l.id}`"
              icon="i-lucide-hand-helping"
              :name="l.borrower || t('inventory.loans.no-borrower')"
              :description="`${t(`inventory.loan-states.${l.state}`)} · ${describe(l)}`"
              muted
            />
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
