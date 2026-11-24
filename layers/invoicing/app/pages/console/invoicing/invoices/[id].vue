<!-- One invoice (wireframe S2). A draft opens in its editor, with Issue beside it and Delete in the
     menu. An issued one shows who it is to, its lines, what has been paid and when, and Record a
     payment while anything is owed. -->
<script setup lang="ts">
import type { DraftBody, DraftChoices, SavedLine } from '../../../../composables/useInvoiceDraft'
import type { InvoiceShown } from '../../../../composables/useInvoiceText'

interface InvoiceView {
  invoice: {
    id: string
    number: string | null
    state: string
    label: InvoiceShown
    overdueDays: number
    version: number
    currency: string
    partyModule: string | null
    partyId: string | null
    billToName: string
    billToAddress: string
    billToEmail: string | null
    taxNumber: string
    sellerTaxNumber: string | null
    reference: string
    issueOn: string | null
    dueOn: string | null
    suppliedOn: string | null
    netMinor: number
    taxMinor: number
    totalMinor: number
    allocatedMinor: number
    notes: string
    internalNote: string
  }
  lines: (SavedLine & { id: string, netMinor: number, taxMinor: number, taxRateBp: number })[]
  allocations: { id: string, kind: 'payment' | 'credit' | 'write_off' | 'reversal', amountMinor: number, onDate: string, createdAt: number }[]
  choices: DraftChoices | null
  paymentAccounts: { id: string, label: string }[]
  pdfUrl: string | null
  sends: { id: string, step: 'sent' | 'before-due' | 'overdue-1' | 'overdue-2' | 'manual', at: number }[]
  canSend: boolean
  canEdit: boolean
  canIssue: boolean
  canRecordPayment: boolean
}

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { $api } = useNuxtApp()
const { day, dateTime } = useDates()
const toast = useToast()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const text = useInvoiceText()
const { data, status, error, refresh } = await useAPI<InvoiceView>(() => `/api/invoicing/invoices/${id.value}`, { key: `invoicing:invoice:${id.value}` })
const invoice = computed(() => data.value?.invoice)
const money = (minor: number) => text.money(minor, invoice.value?.currency ?? 'GBP')
const title = computed(() => invoice.value?.number
  ? t('invoicing.screens.invoices.numbered', { number: invoice.value.number, name: invoice.value.billToName })
  : t('invoicing.screens.invoices.draft-title', { name: invoice.value?.billToName || t('invoicing.screens.invoices.untitled') }))
const editing = computed(() => !!data.value?.canEdit && !!data.value.choices)
const saved = computed(() => data.value ? { invoice: data.value.invoice, lines: data.value.lines } : undefined)
const owed = computed(() => invoice.value ? invoice.value.totalMinor - invoice.value.allocatedMinor : 0)
const issuing = ref(false)
const paying = ref(false)

async function save(body: DraftBody) {
  await $api(`/api/invoicing/invoices/${id.value}`, { method: 'PUT', body: { ...body, version: invoice.value!.version } })
  toast.add({ title: t('invoicing.screens.draft.saved'), color: 'success' })
  await refresh()
}
async function remove() {
  if (!await confirm({ verb: t('invoicing.screens.draft.delete'), thing: title.value, consequence: t('invoicing.screens.draft.delete-consequence') })) return
  try {
    await $api(`/api/invoicing/invoices/${id.value}`, { method: 'DELETE', body: { version: invoice.value!.version } })
    await navigateTo('/console/invoicing/invoices')
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
}
async function issued(number: string) {
  toast.add({ title: t('invoicing.screens.issue.done', { number }), color: 'success' })
  await refresh()
}
async function send() {
  try {
    const done = await $api<{ step: string }>(`/api/invoicing/invoices/${id.value}/send`, { method: 'POST' })
    toast.add({ title: t(done.step === 'sent' ? 'invoicing.screens.send.sent' : 'invoicing.screens.send.reminded', { email: invoice.value?.billToEmail ?? '' }), color: 'success' })
    await refresh()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
}
async function recorded() {
  toast.add({ title: t('invoicing.screens.payment.done'), color: 'success' })
  await refresh()
}

const actions = computed(() => [
  ...(data.value?.canIssue ? [{ label: t('invoicing.screens.issue.title'), icon: 'i-lucide-send', onSelect: () => { issuing.value = true } }] : []),
  ...(data.value?.canRecordPayment ? [{ label: t('invoicing.screens.payment.title'), icon: 'i-lucide-banknote', onSelect: () => { paying.value = true } }] : []),
])
const everSent = computed(() => !!data.value?.sends.some(s => s.step === 'sent'))
const menu = computed(() => [
  ...(data.value?.canEdit ? [{ label: t('invoicing.screens.draft.delete'), icon: 'i-lucide-trash-2', onSelect: remove }] : []),
  ...(data.value?.pdfUrl ? [{ label: t('invoicing.screens.invoices.pdf'), icon: 'i-lucide-file-down', to: data.value.pdfUrl, external: true, target: '_blank' }] : []),
  ...(data.value?.canSend && (!everSent.value || invoice.value?.state === 'open') ? [{ label: t(everSent.value ? 'invoicing.screens.send.remind' : 'invoicing.screens.send.send'), icon: 'i-lucide-mail', onSelect: send }] : []),
])
const facts = computed(() => {
  const i = invoice.value
  if (!i) return []
  return [
    { label: t('invoicing.screens.invoices.state'), value: text.overdue(i.overdueDays) ?? text.state(i.label).label },
    { label: t('invoicing.screens.invoices.total'), value: money(i.totalMinor) },
    ...(i.state === 'open' ? [{ label: t('invoicing.screens.invoices.owed-label'), value: money(owed.value) }] : []),
    ...(i.issueOn ? [{ label: t('invoicing.screens.invoices.issued-on'), value: day(i.issueOn) }] : []),
    ...(i.dueOn ? [{ label: t('invoicing.screens.invoices.due-on'), value: day(i.dueOn) }] : []),
  ]
})
const lineDescription = (l: InvoiceView['lines'][number]) => [
  t('invoicing.screens.invoices.line-sum', { quantity: l.quantityMilli / 1000, price: money(l.unitMinor) }), // not-policy: thousandths
  l.taxMinor ? t('invoicing.screens.invoices.line-vat', { amount: money(l.taxMinor) }) : null,
].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame
    :title="title"
    :trail="[{ label: t('invoicing.navigation.invoices.label'), to: '/console/invoicing/invoices' }]"
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
      <InvoicingDraftEditor
        v-if="data && editing"
        :choices="data.choices!"
        :saved="saved"
        :currency="data.invoice.currency"
        :save-label="t('invoicing.screens.draft.save')"
        :submit="save"
      />
      <div
        v-else-if="data"
        class="space-y-6"
      >
        <FactStrip :facts="facts" />
        <PageSection :title="t('invoicing.screens.invoices.to')">
          <p class="whitespace-pre-line text-sm">
            {{ [data.invoice.billToName, data.invoice.billToAddress, data.invoice.billToEmail].filter(Boolean).join('\n') }}
          </p>
          <p
            v-if="data.invoice.reference"
            class="mt-2 text-sm text-muted"
          >
            {{ t('invoicing.screens.invoices.their-reference', { reference: data.invoice.reference }) }}
          </p>
        </PageSection>
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
        <PageSection
          v-if="data.allocations.length"
          :title="t('invoicing.screens.invoices.payments')"
        >
          <RecordList :label="t('invoicing.screens.invoices.payments')">
            <RecordListItem
              v-for="a in data.allocations"
              :key="a.id"
              :icon="a.kind === 'reversal' ? 'i-lucide-undo-2' : 'i-lucide-banknote'"
              :name="t(`invoicing.screens.invoices.allocation.${a.kind}`)"
              :description="day(a.onDate)"
            >
              <span class="text-sm tabular-nums">{{ money(a.amountMinor) }}</span>
            </RecordListItem>
          </RecordList>
        </PageSection>
        <PageSection
          v-if="data.sends.length"
          :title="t('invoicing.screens.send.log')"
        >
          <RecordList :label="t('invoicing.screens.send.log')">
            <RecordListItem
              v-for="s in data.sends"
              :key="s.id"
              icon="i-lucide-mail"
              :name="t(`invoicing.screens.send.steps.${s.step}`)"
              :description="dateTime(s.at)"
            />
          </RecordList>
        </PageSection>
        <PageSection
          v-if="data.invoice.notes || data.invoice.internalNote"
          :title="t('invoicing.screens.draft.notes-group')"
        >
          <p
            v-if="data.invoice.notes"
            class="whitespace-pre-line text-sm"
          >
            {{ data.invoice.notes }}
          </p>
          <p
            v-if="data.invoice.internalNote"
            class="mt-2 whitespace-pre-line text-sm text-muted"
          >
            {{ t('invoicing.screens.invoices.internal', { note: data.invoice.internalNote }) }}
          </p>
        </PageSection>
      </div>
    </DataBoundary>
    <InvoicingIssueDialog
      v-if="invoice"
      v-model:open="issuing"
      :invoice-id="invoice.id"
      :version="invoice.version"
      :total-minor="invoice.totalMinor"
      :currency="invoice.currency"
      :email="invoice.billToEmail"
      @issued="issued"
    />
    <InvoicingPaymentDialog
      v-if="invoice && data"
      v-model:open="paying"
      :invoice-id="invoice.id"
      :outstanding-minor="owed"
      :currency="invoice.currency"
      :accounts="data.paymentAccounts"
      @recorded="recorded"
    />
  </PageFrame>
</template>
