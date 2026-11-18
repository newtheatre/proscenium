<!-- A stocktake (S10). While counting: a line per item, counted in the unit people count in (a part
     is fine: 2.5 bottles), or weighed in grams for an item with full and empty weights; a line can be
     taken out of the count. The level is shown beside it unless counts are blind. Submitting reads
     what was expected from the levels at that moment. Once submitted, the review: expected, counted,
     the difference and its value, and a reason for each line that differs; someone who approves
     counts approves it (changing the levels) or sends it back. Approved or abandoned, it is a record. -->
<script setup lang="ts">
type Unit = 'each' | 'ml' | 'g'
type State = 'counting' | 'submitted' | 'approved' | 'abandoned'
interface Line { id: string, stockItemId: string, name: string, baseUnit: Unit, countUnitSize: number, packSize: number, weighable: boolean, counted: number | null, expected: number | null, level: number | null, varianceValueMinor: number | null, reasonTermId: string | null }
interface Stocktake { id: string, locationId: string, location: string, state: State, category: string | null, startedBy: string, submittedBy: string | null, approvedBy: string | null, startedAt: number, submittedAt: number | null, approvedAt: number | null, varianceValueMinor: number | null }

const { t } = useT()
const route = useRoute()
const router = useRouter()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime } = useDates()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()

const id = computed(() => route.params.id as string)
const { data, status, error, refresh } = await useAPI<{ stocktake: Stocktake, lines: Line[], blind: boolean, reasons: { id: string, label: string }[], can: { approve: boolean } }>(
  () => `/api/bar/stocktakes/${id.value}`,
  { key: `bar:stocktake:${id.value}` },
)
const state = computed(() => data.value?.stocktake.state)
const tone = (s: State) => ({ counting: 'info', submitted: 'warning', approved: 'success', abandoned: 'neutral' } as const)[s]

const number = (n: number, digits = 2) => n.toLocaleString(undefined, { maximumFractionDigits: digits })
const unitLabel = (u: Unit) => t(`bar.screens.stock.units.${u}`)
function amount(l: Line, quantity: number): string {
  const base = `${number(Math.abs(quantity), 0)} ${unitLabel(l.baseUnit)}`
  const text = l.countUnitSize === 1 ? base : t('bar.screens.stock.counted', { count: number(Math.abs(quantity) / l.countUnitSize), base })
  return quantity < 0 ? `−${text}` : text
}
// What one count unit is, beside the box: "each", or "of 750 ml".
const countUnit = (l: Line) => l.countUnitSize === 1 ? unitLabel(l.baseUnit) : t('bar.screens.stocktakes.of-size', { size: number(l.countUnitSize, 0), unit: unitLabel(l.baseUnit) })

// Counting: what is typed, by line. A weight, when given, wins over a count.
const entries = ref<Record<string, { count: number | null, weighed: number | null }>>({})
watch(data, (d) => {
  if (!d) return
  entries.value = Object.fromEntries(d.lines.map(l => [l.id, { count: l.counted === null ? null : l.counted / l.countUnitSize, weighed: null }]))
}, { immediate: true })
type Change = { lineId: string, weighedG: number } | { lineId: string, counted: number | null }
function changes(): Change[] {
  return (data.value?.lines ?? []).flatMap((l): Change[] => {
    const e = entries.value[l.id]
    if (!e) return []
    if (e.weighed !== null && l.weighable) return [{ lineId: l.id, weighedG: Math.round(e.weighed) }]
    const counted = e.count === null ? null : Math.round(e.count * l.countUnitSize)
    return counted === l.counted ? [] : [{ lineId: l.id, counted }]
  })
}
const counted = computed(() => (data.value?.lines ?? []).filter(l => entries.value[l.id]?.count !== null || entries.value[l.id]?.weighed !== null).length)

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
async function attempt(work: () => Promise<void>) {
  refusal.value = null
  busy.value = true
  try {
    await work()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
async function saveCounts() {
  const lines = changes()
  if (lines.length) await $api(`/api/bar/stocktakes/${id.value}/counts` as string, { method: 'POST', body: { lines } })
}
const save = () => attempt(async () => {
  await saveCounts()
  toast.add({ title: t('bar.screens.stocktakes.saved'), color: 'success' })
  await refresh()
})
const submit = () => attempt(async () => {
  await saveCounts()
  await $api(`/api/bar/stocktakes/${id.value}/submit` as string, { method: 'POST', body: {} })
  toast.add({ title: t('bar.screens.stocktakes.submitted'), color: 'success' })
  await refresh()
})
const takeOut = (l: Line) => attempt(async () => {
  await $api(`/api/bar/stocktakes/${id.value}/counts` as string, { method: 'POST', body: { lines: [{ lineId: l.id, notCounted: true }] } })
  toast.add({ title: t('bar.screens.stocktakes.taken-out', { name: l.name }), color: 'success' })
  await refresh()
})

// Review.
const NONE = 'none'
const reasonItems = computed(() => [{ value: NONE, label: t('bar.screens.stocktakes.no-reason') }, ...(data.value?.reasons ?? []).map(r => ({ value: r.id, label: r.label }))])
const setReason = (l: Line, value: string) => attempt(async () => {
  await $api(`/api/bar/stocktakes/${id.value}/reasons` as string, { method: 'POST', body: { lines: [{ lineId: l.id, reasonTermId: value === NONE ? null : value }] } })
  l.reasonTermId = value === NONE ? null : value
})
const differs = (l: Line) => l.counted !== null && l.expected !== null && l.counted !== l.expected
const changing = computed(() => (data.value?.lines ?? []).filter(differs).length)
const approve = () => attempt(async () => {
  const answer = await $api<{ changed: number }>(`/api/bar/stocktakes/${id.value}/approve` as string, { method: 'POST', body: {} })
  toast.add({ title: t('bar.screens.stocktakes.approved', { count: answer.changed }), color: 'success' })
  await refresh()
})
const sendBack = () => attempt(async () => {
  await $api(`/api/bar/stocktakes/${id.value}/send-back` as string, { method: 'POST', body: {} })
  toast.add({ title: t('bar.screens.stocktakes.sent-back'), color: 'success' })
  await refresh()
})
async function abandon() {
  const ok = await confirm({ verb: t('bar.screens.stocktakes.abandon'), thing: t('bar.screens.stocktakes.this-count'), consequence: t('bar.screens.stocktakes.abandon-consequence'), button: t('bar.screens.stocktakes.abandon') })
  if (!ok) return
  await attempt(async () => {
    await $api(`/api/bar/stocktakes/${id.value}/abandon` as string, { method: 'POST', body: {} })
    await router.push('/console/bar/stocktakes')
  })
}

const countColumns = computed(() => [
  { accessorKey: 'name', header: t('bar.screens.stocktakes.item') },
  ...(data.value?.blind ? [] : [{ id: 'level', header: t('bar.screens.stocktakes.level') }]),
  { id: 'count', header: t('bar.screens.stocktakes.count') },
  ...((data.value?.lines ?? []).some(l => l.weighable) ? [{ id: 'weighed', header: t('bar.screens.stocktakes.weighed') }] : []),
  { id: 'remove', header: '' },
])
const reviewColumns = computed(() => [
  { accessorKey: 'name', header: t('bar.screens.stocktakes.item') },
  { id: 'expected', header: t('bar.screens.stocktakes.expected') },
  { id: 'counted', header: t('bar.screens.stocktakes.counted') },
  { id: 'difference', header: t('bar.screens.stocktakes.difference') },
  { id: 'value', header: t('bar.screens.stocktakes.value') },
  ...(state.value === 'submitted' ? [{ id: 'reason', header: t('bar.screens.stocktakes.reason') }] : []),
])
const reasonLabel = (termId: string | null) => data.value?.reasons.find(r => r.id === termId)?.label ?? ''
const title = computed(() => data.value
  ? t('bar.screens.stocktakes.title', { location: data.value.stocktake.location, what: data.value.stocktake.category ?? t('bar.screens.stocktakes.everything') })
  : t('bar.navigation.stocktakes.label'))
const facts = computed(() => {
  const s = data.value?.stocktake
  if (!s) return []
  return [
    { label: t('bar.screens.stocktakes.started'), value: `${dateTime(s.startedAt)} · ${s.startedBy}` },
    ...(s.submittedAt ? [{ label: t('bar.screens.stocktakes.submitted-at'), value: `${dateTime(s.submittedAt)} · ${s.submittedBy ?? ''}` }] : []),
    ...(s.approvedAt ? [{ label: t('bar.screens.stocktakes.approved-at'), value: `${dateTime(s.approvedAt)} · ${s.approvedBy ?? ''}` }] : []),
    ...(s.varianceValueMinor !== null && s.state !== 'counting' ? [{ label: t('bar.screens.stocktakes.difference'), value: money(s.varianceValueMinor) }] : []),
  ]
})
const showReview = computed(() => state.value !== 'counting' && (data.value?.lines ?? []).some(l => l.expected !== null))
</script>

<template>
  <PageFrame
    :title="title"
    :trail="[{ label: t('bar.navigation.stocktakes.label'), to: '/console/bar/stocktakes' }]"
  >
    <template #status>
      <StatusBadge
        v-if="data"
        :tone="tone(data.stocktake.state)"
        :label="t(`bar.screens.stocktakes.states.${data.stocktake.state}`)"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-6">
          <FactStrip :facts="facts" />
          <RefusalNotice :refusal="refusal" />

          <UForm
            v-if="d.stocktake.state === 'counting'"
            id="bar-stocktake-count"
            :state="entries"
            novalidate
            @submit="submit"
          >
            <PageSection
              :title="t('bar.screens.stocktakes.counting')"
              :description="d.blind ? t('bar.screens.stocktakes.counting-blind') : t('bar.screens.stocktakes.counting-help')"
            >
              <UTable
                :data="d.lines"
                :columns="countColumns"
                :caption="t('bar.screens.stocktakes.counting')"
              >
                <template #name-cell="{ row }">
                  <span class="font-medium">{{ row.original.name }}</span>
                </template>
                <template #level-cell="{ row }">
                  <span class="tabular-nums">{{ row.original.level === null ? '' : amount(row.original, row.original.level) }}</span>
                </template>
                <template #count-cell="{ row }">
                  <UFieldGroup v-if="entries[row.original.id]">
                    <UInputNumber
                      v-model="entries[row.original.id]!.count"
                      :min="0"
                      :step="row.original.countUnitSize === 1 ? 1 : 0.1"
                      :format-options="{ maximumFractionDigits: row.original.countUnitSize === 1 ? 0 : 2 }"
                      :aria-label="t('bar.screens.stocktakes.count-of', { name: row.original.name })"
                    />
                    <UBadge
                      color="neutral"
                      variant="outline"
                      size="lg"
                      :label="countUnit(row.original)"
                    />
                  </UFieldGroup>
                </template>
                <template #weighed-cell="{ row }">
                  <UFieldGroup v-if="row.original.weighable && entries[row.original.id]">
                    <UInputNumber
                      v-model="entries[row.original.id]!.weighed"
                      :min="0"
                      :aria-label="t('bar.screens.stocktakes.weight-of', { name: row.original.name })"
                    />
                    <UBadge
                      color="neutral"
                      variant="outline"
                      size="lg"
                      :label="unitLabel('g')"
                    />
                  </UFieldGroup>
                </template>
                <template #remove-cell="{ row }">
                  <IconButton
                    icon="i-lucide-x"
                    :label="t('bar.screens.stocktakes.take-out', { name: row.original.name })"
                    @click="takeOut(row.original)"
                  />
                </template>
              </UTable>
            </PageSection>
          </UForm>

          <PageSection
            v-else-if="showReview"
            :title="t('bar.screens.stocktakes.review')"
            :description="d.stocktake.state === 'submitted' ? t('bar.screens.stocktakes.review-help') : undefined"
          >
            <UTable
              :data="d.lines"
              :columns="reviewColumns"
              :caption="t('bar.screens.stocktakes.review')"
            >
              <template #name-cell="{ row }">
                <span class="font-medium">{{ row.original.name }}</span>
                <span
                  v-if="d.stocktake.state !== 'submitted' && row.original.reasonTermId"
                  class="block text-sm text-muted"
                >{{ reasonLabel(row.original.reasonTermId) }}</span>
              </template>
              <template #expected-cell="{ row }">
                <span class="tabular-nums">{{ row.original.expected === null ? '' : amount(row.original, row.original.expected) }}</span>
              </template>
              <template #counted-cell="{ row }">
                <span class="tabular-nums">{{ row.original.counted === null ? '' : amount(row.original, row.original.counted) }}</span>
              </template>
              <template #difference-cell="{ row }">
                <span
                  v-if="differs(row.original)"
                  :class="['tabular-nums', row.original.counted! < row.original.expected! ? 'text-error' : 'text-success']"
                >{{ row.original.counted! > row.original.expected! ? '+' : '' }}{{ amount(row.original, row.original.counted! - row.original.expected!) }}</span>
                <span
                  v-else
                  class="text-muted"
                >{{ t('bar.screens.stocktakes.matches') }}</span>
              </template>
              <template #value-cell="{ row }">
                <span class="tabular-nums">{{ row.original.varianceValueMinor ? money(row.original.varianceValueMinor) : '' }}</span>
              </template>
              <template #reason-cell="{ row }">
                <UFormField
                  v-if="differs(row.original)"
                  :label="t('bar.screens.stocktakes.reason-for', { name: row.original.name })"
                  :name="`reason-${row.original.id}`"
                  :ui="{ label: 'sr-only' }"
                >
                  <USelect
                    :model-value="row.original.reasonTermId ?? NONE"
                    :items="reasonItems"
                    class="min-w-40"
                    @update:model-value="v => setReason(row.original, v as string)"
                  />
                </UFormField>
              </template>
            </UTable>
          </PageSection>
          <p
            v-else-if="d.stocktake.state === 'submitted'"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.stocktakes.waiting') }}
          </p>
          <p
            v-if="d.stocktake.state === 'abandoned'"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.stocktakes.abandoned-note') }}
          </p>
        </div>
      </template>
    </DataBoundary>
    <template
      v-if="state === 'counting' || state === 'submitted'"
      #footer
    >
      <div class="flex flex-wrap items-center gap-2">
        <template v-if="state === 'counting'">
          <UButton
            type="submit"
            form="bar-stocktake-count"
            :loading="busy"
            :label="t('bar.screens.stocktakes.submit', { counted, total: data?.lines.length ?? 0 })"
          />
          <UButton
            color="neutral"
            variant="outline"
            :loading="busy"
            :label="t('bar.screens.stocktakes.save')"
            @click="save"
          />
        </template>
        <template v-else-if="data?.can.approve">
          <UButton
            :loading="busy"
            :label="t('bar.screens.stocktakes.approve', { count: changing })"
            @click="approve"
          />
          <UButton
            color="neutral"
            variant="outline"
            :loading="busy"
            :label="t('bar.screens.stocktakes.send-back')"
            @click="sendBack"
          />
        </template>
        <UButton
          color="error"
          variant="ghost"
          :label="t('bar.screens.stocktakes.abandon')"
          @click="abandon"
        />
      </div>
    </template>
  </PageFrame>
</template>
