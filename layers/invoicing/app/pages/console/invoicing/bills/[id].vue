<!-- One bill (wireframe S4). A draft opens in its editor beside the supplier's file, with Submit once
     the file is attached; a submitted one shows Approve and Send back to anyone but whoever logged it
     (rule I-10); a bill sent back shows the approver's reason at the top. -->
<script setup lang="ts">
import type { BillView } from '../../../../composables/useBill'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { day } = useDates()
const { confirm } = useConfirm()
const text = useInvoiceText()
const { data, status, error, refresh, bill, save, remove, attach, submit, approve, sendBack } = await useBill(id)
const money = (minor: number) => text.money(minor, bill.value?.currency ?? 'GBP')
const title = computed(() => bill.value?.number
  ? t('invoicing.screens.bills.numbered', { number: bill.value.number, name: bill.value.billToName })
  : bill.value?.billToName ?? '')
const editing = computed(() => !!data.value?.canEdit && !!data.value.choices)
const saved = computed(() => data.value ? { bill: data.value.bill, lines: data.value.lines } : undefined)
const returning = ref(false)

async function deleteBill() {
  if (await confirm({ verb: t('invoicing.screens.draft.delete'), thing: title.value, consequence: t('invoicing.screens.bill.delete-consequence') })) await remove()
}
async function approveBill() {
  if (await confirm({ verb: t('invoicing.screens.bill.approve'), thing: title.value, consequence: t('invoicing.screens.bill.approve-consequence', { amount: money(bill.value!.totalMinor) }), button: t('invoicing.screens.bill.approve') })) await approve()
}

const actions = computed(() => [
  ...(data.value?.canEdit ? [{ label: t('invoicing.screens.bill.submit'), icon: 'i-lucide-send', onSelect: submit }] : []),
  ...(data.value?.canApprove ? [{ label: t('invoicing.screens.bill.approve'), icon: 'i-lucide-check', onSelect: approveBill }] : []),
])
const menu = computed(() => [
  ...(data.value?.canEdit ? [{ label: t('invoicing.screens.draft.delete'), icon: 'i-lucide-trash-2', onSelect: deleteBill }] : []),
  ...(data.value?.canApprove ? [{ label: t('invoicing.screens.bill.return'), icon: 'i-lucide-undo-2', onSelect: () => { returning.value = true } }] : []),
])
const facts = computed(() => {
  const b = bill.value
  if (!b) return []
  return [
    { label: t('invoicing.screens.invoices.state'), value: t(`invoicing.screens.bills.states.${b.state}`) },
    { label: t('invoicing.screens.invoices.total'), value: money(b.totalMinor) },
    ...(b.taxMinor ? [{ label: t('invoicing.screens.invoices.vat'), value: money(b.taxMinor) }] : []),
    ...(b.issueOn ? [{ label: t('invoicing.screens.bill.issue-on'), value: day(b.issueOn) }] : []),
    ...(b.dueOn ? [{ label: t('invoicing.screens.bill.due-on'), value: day(b.dueOn) }] : []),
  ]
})
const lineDescription = (l: BillView['lines'][number]) => [
  t('invoicing.screens.invoices.line-sum', { quantity: l.quantityMilli / 1000, price: money(l.unitMinor) }), // not-policy: thousandths
  l.taxMinor ? t('invoicing.screens.invoices.line-vat', { amount: money(l.taxMinor) }) : null,
].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame
    :title="title"
    :trail="[{ label: t('invoicing.navigation.bills.label'), to: '/console/invoicing/bills' }]"
    width="reading"
  >
    <template #primary>
      <PageActions
        :actions="actions"
        :menu="menu"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data"
        class="space-y-6"
      >
        <UAlert
          v-if="data.bill.returnedNote && data.bill.state === 'draft'"
          color="warning"
          variant="subtle"
          icon="i-lucide-undo-2"
          :title="t('invoicing.screens.bill.returned-title')"
          :description="data.bill.returnedNote"
        />
        <p
          v-if="data.bill.state === 'submitted' && data.mine"
          class="text-sm text-muted"
        >
          {{ t('invoicing.screens.bill.waiting-other') }}
        </p>
        <InvoicingBillFile
          :url="data.fileUrl"
          :can-change="data.canEdit"
          :attach="attach"
        />
        <InvoicingBillEditor
          v-if="editing"
          :choices="data.choices!"
          :saved="saved"
          :currency="data.bill.currency"
          :save-label="t('invoicing.screens.draft.save')"
          :submit="save"
        />
        <template v-else>
          <FactStrip :facts="facts" />
          <PageSection :title="t('invoicing.screens.draft.lines')">
            <RecordList :label="t('invoicing.screens.draft.lines')">
              <RecordListItem
                v-for="l in data.lines"
                :key="l.id"
                icon="i-lucide-list"
                :name="l.description"
                :description="lineDescription(l)"
              >
                <span class="text-sm tabular-nums">{{ money(l.netMinor) }}</span>
              </RecordListItem>
            </RecordList>
          </PageSection>
          <p
            v-if="data.bill.internalNote"
            class="whitespace-pre-line text-sm text-muted"
          >
            {{ t('invoicing.screens.invoices.internal', { note: data.bill.internalNote }) }}
          </p>
        </template>
      </div>
    </DataBoundary>
    <InvoicingBillReturnDialog
      v-model:open="returning"
      :send="sendBack"
    />
  </PageFrame>
</template>
