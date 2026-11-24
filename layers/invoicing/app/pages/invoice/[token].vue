<!-- The public invoice (S12, rule I-18): the page the link in an invoice's email opens, with no sign-in.
     It shows the invoice as issued, what is still owed and the theatre's bank details, with the PDF to
     download. Nothing else about the customer is shown, since anyone holding the link sees this page. -->
<script setup lang="ts">
interface PublicInvoice {
  theatre: string
  number: string
  vat: boolean
  sellerTaxNumber: string | null
  billToName: string
  reference: string
  issueOn: string
  dueOn: string
  currency: string
  netMinor: number
  taxMinor: number
  totalMinor: number
  owedMinor: number
  lines: { description: string, quantityMilli: number, unitMinor: number, netMinor: number, taxMinor: number, taxRateBp: number }[]
  bankDetails: string | null
  notes: string
  pdfReady: boolean
}

definePageMeta({ key: 'invoicing-public-invoice' })
const { t } = useT()
const { day } = useDates()
const text = useInvoiceText()
const route = useRoute()
const token = computed(() => String(route.params.token))
useSeoMeta({ title: () => t('invoicing.screens.public.title'), robots: 'noindex' })
const { data, error } = await useAPI<PublicInvoice>(() => `/api/invoicing/pay/${token.value}`, { key: `invoicing:public:${token.value}` })
const money = (minor: number) => text.money(minor, data.value?.currency ?? 'GBP')
const MILLI = 1000 // not-policy: quantities are held in thousandths
const PERCENT = 100 // not-policy: basis points to a percentage
const facts = computed(() => data.value
  ? [
      { label: t('invoicing.screens.invoices.issued-on'), value: day(data.value.issueOn) },
      { label: t('invoicing.screens.invoices.due-on'), value: day(data.value.dueOn) },
      { label: t('invoicing.screens.invoices.total'), value: money(data.value.totalMinor) },
      { label: t('invoicing.screens.invoices.owed-label'), value: money(data.value.owedMinor) },
    ]
  : [])
const lineDescription = (l: PublicInvoice['lines'][number]) => [
  t('invoicing.screens.invoices.line-sum', { quantity: l.quantityMilli / MILLI, price: money(l.unitMinor) }),
  data.value?.vat ? t('invoicing.screens.public.line-vat', { rate: l.taxRateBp / PERCENT, amount: money(l.taxMinor) }) : null,
].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame
    :title="data ? t('invoicing.screens.public.heading', { number: data.number, theatre: data.theatre }) : t('invoicing.screens.public.title')"
    width="reading"
  >
    <EmptyState
      v-if="error || !data"
      icon="i-lucide-file-x"
      :title="t('invoicing.screens.public.not-found')"
      :description="t('invoicing.screens.public.not-found-help')"
    />
    <div
      v-else
      class="space-y-6"
    >
      <UAlert
        v-if="!data.owedMinor"
        color="success"
        variant="subtle"
        icon="i-lucide-check"
        :title="t('invoicing.screens.public.nothing-owed')"
      />
      <FactStrip
        :facts="facts"
        framed
      />
      <PageSection
        v-if="data.owedMinor && data.bankDetails"
        :title="t('invoicing.screens.public.how-to-pay')"
      >
        <p class="whitespace-pre-line text-sm">
          {{ data.bankDetails }}
        </p>
        <p class="mt-2 text-sm text-muted">
          {{ t('invoicing.screens.public.quote', { number: data.number }) }}
        </p>
      </PageSection>
      <PageSection :title="t('invoicing.screens.draft.lines')">
        <RecordList :label="t('invoicing.screens.draft.lines')">
          <RecordListItem
            v-for="(l, i) in data.lines"
            :key="i"
            icon="i-lucide-list"
            :name="l.description"
            :description="lineDescription(l)"
          >
            <span class="text-sm tabular-nums">{{ money(l.netMinor) }}</span>
          </RecordListItem>
        </RecordList>
      </PageSection>
      <p
        v-if="data.notes"
        class="whitespace-pre-line text-sm"
      >
        {{ data.notes }}
      </p>
      <UButton
        v-if="data.pdfReady"
        :to="`/api/invoicing/pay/${token}/pdf`"
        external
        target="_blank"
        icon="i-lucide-file-down"
        color="neutral"
        variant="outline"
        :label="t('invoicing.screens.public.pdf')"
      />
    </div>
  </PageFrame>
</template>
