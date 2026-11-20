<!-- A bar sale (S4): its lines with any refunds under each, and its age checks: the answer that let it
     through and any refusal made from its basket. A paid sale is never edited; its primary
     action is "Refund", which opens a panel to choose lines and quantities (or a goodwill amount), the
     reason and what happened to the goods. The button names the amount. Payments decides whether a
     second person must approve it. -->
<script setup lang="ts">
type State = 'open' | 'awaiting_payment' | 'paid' | 'void'
interface Reversal { id: string, state: 'requested' | 'succeeded' | 'failed', quantity: number, amountMinor: number, reason: string, stockOutcome: string, at: number }
interface Line { id: string, label: string, quantity: number, unitMinor: number, amountMinor: number, reversedQuantity: number, reversedMinor: number, packaged: boolean, reversals: Reversal[] }
interface AgeCheck { outcome: 'not_needed' | 'id_checked' | 'self_attested' | 'refused', reason: string | null, product: string | null, scope: 'restricted' | 'all' | null, idType: string | null, at: number }
interface Sale { id: string, reference: string, state: State, totalMinor: number, outlet: string, operatingDay: string, soldBy: string, at: number, paidAt: number | null, lines: Line[] }

const { t } = useT()
const route = useRoute()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime, day } = useDates()
const { toRefusal } = useRefusal()
const toast = useToast()
const reference = computed(() => String(route.params.reference))
const { data, status, error, refresh } = await useAPI<{ sale: Sale, ageChecks: AgeCheck[], canRefund: boolean }>(() => `/api/bar/sales/${reference.value}`, { key: `bar:sale:${reference.value}` })
const { data: reasons } = await useAPI<{ terms: { id: string, label: string }[] }>('/api/core/vocabularies/bar.refund-reason/terms', { key: 'bar:refund-reasons', default: () => ({ terms: [] }) })

const trail = computed(() => [{ label: t('bar.navigation.sales.label'), to: '/console/bar/sales' }])
const stateTone = (s: State) => s === 'paid' ? 'success' as const : s === 'void' ? 'neutral' as const : 'warning' as const
const left = (l: Line) => l.amountMinor - l.reversedMinor
const refundable = computed(() => data.value?.sale.state === 'paid' && data.value.sale.lines.some(l => left(l) > 0))

// The refund panel: per line a quantity, or with "goodwill" an amount; then the reason and the goods.
const form = ref<{ lines: Record<string, { quantity: number, goodwill: boolean, goodwillMinor: number | null }>, reasonTermId: string | undefined, stockOutcome: 'returned' | 'wasted' | 'none' } | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const saving = ref(false)
function startRefund() {
  refusal.value = null
  form.value = {
    lines: Object.fromEntries(data.value!.sale.lines.map(l => [l.id, { quantity: 0, goodwill: false, goodwillMinor: null }])),
    reasonTermId: undefined,
    // A poured drink cannot go back on the shelf, so nothing goes back unless someone says so.
    stockOutcome: 'wasted',
  }
}
const amountOf = (l: Line) => {
  const f = form.value?.lines[l.id]
  if (!f) return 0
  return f.goodwill ? (f.goodwillMinor ?? 0) : f.quantity * l.unitMinor
}
const total = computed(() => (data.value?.sale.lines ?? []).reduce((s, l) => s + amountOf(l), 0))
const reasonItems = computed(() => (reasons.value?.terms ?? []).map(r => ({ value: r.id, label: r.label })))
// "Returned to stock" is offered only when everything being refunded is packaged: a can, a packet.
const returnable = computed(() => {
  const chosen = (data.value?.sale.lines ?? []).filter(l => (form.value?.lines[l.id]?.quantity ?? 0) > 0 && !form.value?.lines[l.id]?.goodwill)
  return chosen.length > 0 && chosen.every(l => l.packaged)
})
const goodsItems = computed(() => (['returned', 'wasted', 'none'] as const).filter(g => g !== 'returned' || returnable.value).map(g => ({ value: g, label: t(`bar.screens.sale.goods.${g}`) })))
watch(returnable, (can) => {
  if (!can && form.value?.stockOutcome === 'returned') form.value.stockOutcome = 'wasted'
})
async function refund() {
  const f = form.value!
  refusal.value = null
  saving.value = true
  try {
    const lines = data.value!.sale.lines.flatMap((l) => {
      const x = f.lines[l.id]!
      if (x.goodwill) return x.goodwillMinor ? [{ lineId: l.id, quantity: 0, goodwillMinor: x.goodwillMinor }] : []
      return x.quantity > 0 ? [{ lineId: l.id, quantity: x.quantity }] : []
    })
    const answer = await $api<{ state: 'requested' | 'approved', amountMinor: number }>(`/api/bar/sales/${reference.value}/refund` as string, {
      method: 'POST',
      body: { lines, reasonTermId: f.reasonTermId, stockOutcome: f.stockOutcome, expectedTotalMinor: total.value },
    })
    form.value = null
    toast.add({ title: answer.state === 'requested' ? t('bar.screens.sale.sent-for-approval', { amount: money(answer.amountMinor) }) : t('bar.screens.sale.refund-started', { amount: money(answer.amountMinor) }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}
const checkName = (c: AgeCheck) => [t(`bar.screens.age-checks.outcome.${c.outcome}`), c.reason].filter(Boolean).join(': ')
const checkDetail = (c: AgeCheck) => [
  c.scope === 'all' ? t('bar.screens.age-checks.whole-sale') : null,
  c.product,
  c.idType ? `${t('bar.screens.age-checks.id-type')}: ${t(`bar.desk.id-types.${c.idType}`)}` : null,
  dateTime(c.at),
].filter(Boolean).join(' · ')
const reversalText = (r: Reversal) => t(`bar.screens.sale.reversal.${r.state}`, { amount: money(r.amountMinor), count: r.quantity, reason: r.reason, when: dateTime(r.at) })
</script>

<template>
  <PageFrame
    :title="data ? t('bar.screens.sale.title', { reference: data.sale.reference }) : t('bar.navigation.sales.label')"
    :trail="trail"
  >
    <template #status>
      <StatusBadge
        v-if="data"
        :tone="stateTone(data.sale.state)"
        :label="t(`bar.screens.sales.state.${data.sale.state}`)"
      />
    </template>
    <template #primary>
      <UButton
        v-if="data?.canRefund && refundable"
        icon="i-lucide-undo-2"
        :label="t('bar.screens.sale.refund')"
        @click="startRefund()"
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
        <FactStrip
          :facts="[
            { label: t('bar.screens.sales.total'), value: money(data.sale.totalMinor) },
            { label: t('bar.screens.sales.outlet'), value: `${data.sale.outlet}, ${day(data.sale.operatingDay)}` },
            { label: t('bar.screens.sale.sold-by'), value: data.sale.soldBy },
            { label: t('bar.screens.sales.when'), value: dateTime(data.sale.paidAt ?? data.sale.at) },
          ]"
        />
        <PageSection :title="t('bar.screens.sale.lines')">
          <RecordList :label="t('bar.screens.sale.lines')">
            <RecordListItem
              v-for="l in data.sale.lines"
              :key="l.id"
              :name="l.quantity > 1 ? `${l.quantity} × ${l.label}` : l.label"
              :description="l.reversals.map(reversalText).join(' · ') || undefined"
            >
              <span class="text-sm font-medium tabular-nums">{{ money(l.amountMinor) }}</span>
            </RecordListItem>
          </RecordList>
        </PageSection>
        <PageSection
          v-if="data.ageChecks.length"
          :title="t('bar.screens.sale.age-checks')"
        >
          <RecordList :label="t('bar.screens.sale.age-checks')">
            <RecordListItem
              v-for="(c, i) in data.ageChecks"
              :key="i"
              :name="checkName(c)"
              :description="checkDetail(c)"
              to="/console/bar/age-checks"
            />
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      :open="!!form"
      :title="t('bar.screens.sale.refund')"
      :description="t('bar.screens.sale.refund-help')"
      @update:open="v => { if (!v) form = null }"
    >
      <template #body>
        <UForm
          v-if="form && data"
          id="bar-refund"
          :state="form"
          :validate="() => needs({ reasonTermId: form?.reasonTermId })"
          class="space-y-4"
          novalidate
          @submit="refund"
        >
          <RefusalNotice :refusal="refusal" />
          <div
            v-for="l in data.sale.lines.filter(x => left(x) > 0)"
            :key="l.id"
            class="space-y-2 rounded-md border border-default p-3"
          >
            <p class="font-medium">
              {{ l.label }}
            </p>
            <p class="text-sm text-muted">
              {{ t('bar.screens.sale.line-left', { count: l.quantity - l.reversedQuantity, amount: money(left(l)) }) }}
            </p>
            <UCheckbox
              v-model="form.lines[l.id]!.goodwill"
              :label="t('bar.screens.sale.goodwill')"
            />
            <UFormField
              v-if="form.lines[l.id]!.goodwill"
              :label="t('bar.screens.sale.goodwill-amount')"
              :name="`goodwill-${l.id}`"
            >
              <FieldMoney v-model="form.lines[l.id]!.goodwillMinor" />
            </UFormField>
            <UFormField
              v-else
              :label="t('bar.screens.sale.how-many')"
              :name="`quantity-${l.id}`"
            >
              <UInputNumber
                v-model="form.lines[l.id]!.quantity"
                :min="0"
                :max="l.quantity - l.reversedQuantity"
                class="w-32"
              />
            </UFormField>
          </div>
          <UFormField
            :label="t('bar.screens.sale.reason')"
            name="reasonTermId"
            required
          >
            <USelect
              v-model="form.reasonTermId"
              :items="reasonItems"
              :placeholder="t('bar.screens.sale.choose-reason')"
            />
          </UFormField>
          <UFormField
            :label="t('bar.screens.sale.goods-label')"
            :help="returnable ? undefined : t('bar.screens.sale.goods-help')"
            name="stockOutcome"
          >
            <USelect
              v-model="form.stockOutcome"
              :items="goodsItems"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="bar-refund"
          :loading="saving"
          :disabled="!total"
          :label="t('bar.screens.sale.refund-amount', { amount: money(total) })"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
