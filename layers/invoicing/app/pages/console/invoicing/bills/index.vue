<!-- Bills (IE-19, IE-20, wireframe S3). An approver opens on "Waiting for my approval", which never
     holds a bill they logged (rule I-10); "All bills" lists drafts, then those waiting, then approved
     ones by due date, with paid ones below a divider. -->
<script setup lang="ts">
import type { BillState } from '../../../../composables/useBill'

interface Row { id: string, number: string | null, supplier: string, issueOn: string | null, dueOn: string | null, totalMinor: number, allocatedMinor: number, state: BillState, currency: string, mine: boolean, mayApprove: boolean }
type Tone = 'neutral' | 'info' | 'success' | 'warning'

const { t } = useT()
const { day } = useDates()
const text = useInvoiceText()
const { data, status, error, refresh } = await useAPI<{ bills: Row[], canLog: boolean, canApprove: boolean }>('/api/invoicing/bills', { key: 'invoicing:bills' })
const view = ref<'waiting' | 'all'>('all')
watch(() => data.value?.canApprove, (approver) => { if (approver) view.value = 'waiting' }, { immediate: true })
const views = computed(() => [
  { value: 'waiting', label: t('invoicing.screens.bills.waiting') },
  { value: 'all', label: t('invoicing.screens.bills.all') },
])
const rows = computed(() => (data.value?.bills ?? []).filter(b => view.value === 'all' || b.mayApprove))
const current = computed(() => rows.value.filter(b => b.state !== 'closed'))
const paid = computed(() => rows.value.filter(b => b.state === 'closed'))
const TONES: Record<BillState, Tone> = { draft: 'neutral', submitted: 'warning', open: 'info', closed: 'success' }

const name = (b: Row) => b.number ? t('invoicing.screens.bills.numbered', { number: b.number, name: b.supplier }) : b.supplier
const describe = (b: Row) => [
  text.money(b.totalMinor, b.currency),
  b.dueOn && b.state === 'open' ? t('invoicing.screens.invoices.due', { date: day(b.dueOn) }) : null,
  b.issueOn && b.state !== 'open' ? day(b.issueOn) : null,
].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame :title="t('invoicing.navigation.bills.label')">
    <template #primary>
      <PageActions :actions="data?.canLog ? [{ label: t('invoicing.screens.bills.new'), icon: 'i-lucide-plus', to: '/console/invoicing/bills/new' }] : []" />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <UTabs
          v-if="data?.canApprove"
          v-model="view"
          :items="views"
          :content="false"
          variant="link"
        />
        <EmptyState
          v-if="!rows.length"
          icon="i-lucide-file-input"
          :title="t(view === 'waiting' ? 'invoicing.screens.bills.none-waiting' : 'invoicing.screens.bills.empty')"
          :description="view === 'waiting' ? undefined : t('invoicing.screens.bills.empty-help')"
        />
        <template v-else>
          <RecordList
            v-if="current.length"
            :label="t('invoicing.navigation.bills.label')"
          >
            <RecordListItem
              v-for="b in current"
              :key="b.id"
              :to="`/console/invoicing/bills/${b.id}`"
              icon="i-lucide-file-input"
              :name="name(b)"
              :description="describe(b)"
            >
              <StatusBadge
                :tone="TONES[b.state]"
                :label="t(`invoicing.screens.bills.states.${b.state}`)"
              />
            </RecordListItem>
          </RecordList>
          <CollapsibleDivider
            :label="t('invoicing.screens.bills.paid')"
            :count="paid.length"
          >
            <RecordList :label="t('invoicing.screens.bills.paid')">
              <RecordListItem
                v-for="b in paid"
                :key="b.id"
                :to="`/console/invoicing/bills/${b.id}`"
                icon="i-lucide-file-input"
                :name="name(b)"
                :description="describe(b)"
                muted
              />
            </RecordList>
          </CollapsibleDivider>
        </template>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
