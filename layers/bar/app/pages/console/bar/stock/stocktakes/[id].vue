<!-- A stocktake (S10). While counting: a line per item, counted in the unit people count in (a part
     is fine: 2.5 bottles); for an item with full and empty weights, the full ones are counted and the
     open one weighed, and the two are added. Each line is saved a moment after it is typed and keeps
     the level at that moment as what was expected, so a sale made after a line was counted is allowed
     for. The level is shown beside it unless counts are blind; a line can be taken out of the count.
     Once submitted, the review: expected, counted, the difference and its value, and a reason for
     each line that differs (needed above a set value); someone who approves counts approves it, after
     seeing what was found and what is missing, or sends it back. Approved or abandoned, it is a
     record. -->
<script setup lang="ts">
type State = 'counting' | 'submitted' | 'approved' | 'abandoned'
interface Line { id: string, stockItemId: string, name: string, baseUnit: StockUnit, countUnitSize: number, packSize: number, packName: string, weighable: boolean, fullWeightG: number | null, emptyWeightG: number | null, counted: number | null, expected: number | null, level: number | null, varianceValueMinor: number | null, reasonTermId: string | null }
interface Stocktake { id: string, locationId: string, location: string, state: State, category: string | null, startedBy: string, submittedBy: string | null, approvedBy: string | null, startedAt: number, submittedAt: number | null, approvedAt: number | null, varianceValueMinor: number | null }

const { t } = useT()
const route = useRoute()
const router = useRouter()
const { $api } = useNuxtApp()
const { money } = await useMoney()
const { dateTime } = useDates()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { number, unitLabel, base, countWord, counted: countedText, amount } = useStockAmounts()
const toast = useToast()

const id = computed(() => route.params.id as string)
const { data, status, error, refresh } = await useAPI<{ stocktake: Stocktake, lines: Line[], blind: boolean, reasons: { id: string, label: string }[], can: { approve: boolean, ownCount: boolean }, selfApproveUnderMinor: number, reasonOverMinor: number }>(
  () => `/api/bar/stocktakes/${id.value}`,
  { key: `bar:stocktake:${id.value}` },
)
const state = computed(() => data.value?.stocktake.state)
const tone = (s: State) => ({ counting: 'info', submitted: 'warning', approved: 'success', abandoned: 'neutral' } as const)[s]

// A signed amount for the review: "−1.5 bottles (1,050 ml)".
const signedAmount = (l: Line, quantity: number) => `${quantity < 0 ? '−' : ''}${amount(l, Math.abs(quantity))}`

// Counting: what is typed, by line. For an item with weights, the count is of the full ones and the
// weight is of the open one; the two are added.
interface Entry { count: number | null, weighed: number | null }
const entries = ref<Record<string, Entry>>({})
// What was last saved of each line, so only a line that changed is sent.
const saved = ref<Record<string, string>>({})
const signature = (e: Entry | undefined) => JSON.stringify(e ?? null)
watch(data, (d) => {
  if (!d) return
  const fresh: Record<string, Entry> = Object.fromEntries(d.lines.map(l => [l.id, { count: l.counted === null ? null : l.counted / l.countUnitSize, weighed: null }]))
  saved.value = Object.fromEntries(Object.entries(fresh).map(([lineId, e]) => [lineId, signature(e)]))
  entries.value = fresh
}, { immediate: true })

/** What is left in an open one from its weight, in base units, never below nought. */
function leftByWeight(l: Line, grams: number): number {
  if (l.fullWeightG === null || l.emptyWeightG === null) return 0
  return Math.max(0, (grams - l.emptyWeightG) / (l.fullWeightG - l.emptyWeightG) * l.countUnitSize)
}
/** The line's count in base units as typed, or null while nothing is typed. */
function worked(l: Line): number | null {
  const e = entries.value[l.id]
  if (!e) return null
  if (e.weighed !== null && l.weighable) return Math.round((e.count ?? 0) * l.countUnitSize + leftByWeight(l, e.weighed))
  return e.count === null ? null : Math.round(e.count * l.countUnitSize)
}
/** "2 full + 350 ml open = 2.5 bottles", or the count as it will be recorded. */
function workedText(l: Line): string {
  const total = worked(l)
  if (total === null) return ''
  const e = entries.value[l.id]!
  if (e.weighed !== null && l.weighable)
    return t('bar.screens.stocktakes.worked', { full: number(e.count ?? 0), open: base(l, Math.round(leftByWeight(l, e.weighed))), total: countedText(l, total / l.countUnitSize) })
  return amount(l, total)
}
type Change = { lineId: string, weighedG: number, fullUnits: number } | { lineId: string, counted: number | null }
function changeOf(l: Line): Change {
  const e = entries.value[l.id]!
  if (e.weighed !== null && l.weighable) return { lineId: l.id, weighedG: Math.round(e.weighed), fullUnits: e.count ?? 0 }
  return { lineId: l.id, counted: e.count === null ? null : Math.round(e.count * l.countUnitSize) }
}
const counted = computed(() => (data.value?.lines ?? []).filter(l => worked(l) !== null).length)

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

// Each line is saved a moment after it is typed, so nothing is lost on a reload and what was
// expected is read when the line was counted.
const SAVE_AFTER_MS = 800 // not-policy: a pause in typing
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const saving = ref(0)
async function flush(lineIds: string[]) {
  const lines = (data.value?.lines ?? []).filter(l => lineIds.includes(l.id) && signature(entries.value[l.id]) !== saved.value[l.id])
  if (!lines.length || state.value !== 'counting') return
  const sent = Object.fromEntries(lines.map(l => [l.id, signature(entries.value[l.id])]))
  saving.value++
  try {
    await $api(`/api/bar/stocktakes/${id.value}/counts` as string, { method: 'POST', body: { lines: lines.map(changeOf) } })
    Object.assign(saved.value, sent)
    refusal.value = null
  }
  catch (e) {
    refusal.value = toRefusal(e)
    throw e
  }
  finally {
    saving.value--
  }
}
function schedule(lineId: string) {
  clearTimeout(timers.get(lineId))
  timers.set(lineId, setTimeout(() => {
    timers.delete(lineId)
    flush([lineId]).catch(() => {})
  }, SAVE_AFTER_MS))
}
watch(entries, (now) => {
  for (const [lineId, e] of Object.entries(now)) if (signature(e) !== saved.value[lineId]) schedule(lineId)
}, { deep: true })
/** Sends whatever is waiting, at once. */
async function flushAll() {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  await flush(Object.keys(entries.value))
}
onBeforeUnmount(() => void flushAll().catch(() => {}))

const submit = () => attempt(async () => {
  await flushAll()
  await $api(`/api/bar/stocktakes/${id.value}/submit` as string, { method: 'POST', body: {} })
  toast.add({ title: t('bar.screens.stocktakes.submitted'), color: 'success' })
  await refresh()
})
const takeOut = (l: Line) => attempt(async () => {
  clearTimeout(timers.get(l.id))
  timers.delete(l.id)
  await $api(`/api/bar/stocktakes/${id.value}/counts` as string, { method: 'POST', body: { lines: [{ lineId: l.id, notCounted: true }] } })
  toast.add({ title: t('bar.screens.stocktakes.taken-out', { name: l.name }), color: 'success' })
  saved.value[l.id] = signature(entries.value[l.id])
  await flushAll()
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
// What the count found and what is missing, by value, apart: a net figure hides both.
const found = computed(() => (data.value?.lines ?? []).reduce((sum, l) => sum + Math.max(0, l.varianceValueMinor ?? 0), 0))
const missing = computed(() => (data.value?.lines ?? []).reduce((sum, l) => sum - Math.min(0, l.varianceValueMinor ?? 0), 0))
const needsReason = (l: Line) => differs(l) && !l.reasonTermId && Math.abs(l.varianceValueMinor ?? 0) > (data.value?.reasonOverMinor ?? Infinity)
const askedForReasons = ref(false)
const reasonError = (l: Line) => askedForReasons.value && needsReason(l) ? t('bar.screens.stocktakes.reason-needed', { amount: money(data.value!.reasonOverMinor) }) : undefined
async function approve() {
  refusal.value = null
  const unexplained = (data.value?.lines ?? []).filter(needsReason).length
  if (unexplained) {
    askedForReasons.value = true
    refusal.value = { status: 422, code: 'bar.stocktake.reason-needed', reason: t('bar.screens.stocktakes.reasons-needed', { count: unexplained, amount: money(data.value!.reasonOverMinor) }) }
    return
  }
  const ok = await confirm({
    verb: t('bar.screens.stocktakes.approve-verb'),
    thing: t('bar.screens.stocktakes.this-count'),
    consequence: t('bar.screens.stocktakes.approve-consequence', { count: changing.value, found: money(found.value), missing: money(missing.value), net: money(found.value - missing.value) }),
    button: t('bar.screens.stocktakes.approve', { count: changing.value }),
  })
  if (!ok) return
  await attempt(async () => {
    const answer = await $api<{ changed: number }>(`/api/bar/stocktakes/${id.value}/approve` as string, { method: 'POST', body: {} })
    toast.add({ title: t('bar.screens.stocktakes.approved', { count: answer.changed }), color: 'success' })
    await refresh()
  })
}
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
    await router.push('/console/bar/stock/stocktakes')
  })
}

const anyWeighable = computed(() => (data.value?.lines ?? []).some(l => l.weighable))
const countColumns = computed(() => [
  { accessorKey: 'name', header: t('bar.screens.stocktakes.item') },
  ...(data.value?.blind ? [] : [{ id: 'level', header: t('bar.screens.stocktakes.level') }]),
  { id: 'count', header: t('bar.screens.stocktakes.count') },
  ...(anyWeighable.value ? [{ id: 'weighed', header: t('bar.screens.stocktakes.weighed') }] : []),
  { id: 'total', header: t('bar.screens.stocktakes.total') },
  { id: 'remove' },
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
  : t('bar.screens.stocktakes.list-title'))
const showReview = computed(() => state.value !== 'counting' && (data.value?.lines ?? []).some(l => l.expected !== null))
const facts = computed(() => {
  const s = data.value?.stocktake
  if (!s) return []
  return [
    { label: t('bar.screens.stocktakes.started'), value: `${dateTime(s.startedAt)} · ${s.startedBy}` },
    ...(s.submittedAt ? [{ label: t('bar.screens.stocktakes.submitted-at'), value: `${dateTime(s.submittedAt)} · ${s.submittedBy ?? ''}` }] : []),
    ...(s.approvedAt ? [{ label: t('bar.screens.stocktakes.approved-at'), value: `${dateTime(s.approvedAt)} · ${s.approvedBy ?? ''}` }] : []),
    ...(showReview.value ? [{ label: t('bar.screens.stocktakes.found'), value: money(found.value) }, { label: t('bar.screens.stocktakes.missing'), value: money(missing.value) }] : []),
    ...(s.varianceValueMinor !== null && s.state !== 'counting' ? [{ label: t('bar.screens.stocktakes.difference'), value: money(s.varianceValueMinor) }] : []),
  ]
})
</script>

<template>
  <PageFrame
    :title="title"
    long-title
    :trail="[{ label: t('bar.navigation.stock-levels.label'), to: '/console/bar/stock' }, { label: t('bar.screens.stock-tabs.counts'), to: '/console/bar/stock/stocktakes' }]"
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
              :description="[d.blind ? t('bar.screens.stocktakes.counting-blind') : t('bar.screens.stocktakes.counting-help'), anyWeighable ? t('bar.screens.stocktakes.counting-weighed') : ''].filter(Boolean).join(' ')"
            >
              <!-- On a phone: one item a row, its fields under its name, for counting on the move. -->
              <TableOrList
                :rows="d.lines"
                :columns="countColumns"
                :label="t('bar.screens.stocktakes.counting')"
              >
                <template #item="{ row: l }">
                  <RecordListItem
                    :name="l.name"
                    :description="l.level === null ? undefined : t('bar.screens.stocktakes.level-is', { amount: signedAmount(l, l.level) })"
                  >
                    <IconButton
                      icon="i-lucide-x"
                      :label="t('bar.screens.stocktakes.take-out', { name: l.name })"
                      @click="takeOut(l)"
                    />
                    <template #below>
                      <div
                        v-if="entries[l.id]"
                        class="space-y-2"
                      >
                        <UFieldGroup>
                          <FieldNumber
                            v-model="entries[l.id]!.count"
                            :min="0"
                            size="lg"
                            :step="l.countUnitSize === 1 ? 1 : 0.1"
                            :format-options="{ maximumFractionDigits: l.countUnitSize === 1 ? 0 : 2 }"
                            :aria-label="l.weighable ? t('bar.screens.stocktakes.full-of', { name: l.name }) : t('bar.screens.stocktakes.count-of', { name: l.name })"
                          />
                          <UBadge
                            color="neutral"
                            variant="outline"
                            size="lg"
                            :label="l.weighable ? t('bar.screens.stocktakes.full', { unit: countWord(l, 2) }) : countWord(l, 2)"
                          />
                        </UFieldGroup>
                        <UFormField
                          v-if="l.weighable"
                          :label="t('bar.screens.stocktakes.weighed')"
                        >
                          <UFieldGroup>
                            <FieldNumber
                              v-model="entries[l.id]!.weighed"
                              :min="0"
                              size="lg"
                              :aria-label="t('bar.screens.stocktakes.weight-of', { name: l.name })"
                            />
                            <UBadge
                              color="neutral"
                              variant="outline"
                              size="lg"
                              :label="unitLabel('g')"
                            />
                          </UFieldGroup>
                        </UFormField>
                        <p
                          v-if="l.weighable && workedText(l)"
                          class="text-sm text-muted tabular-nums"
                        >
                          {{ workedText(l) }}
                        </p>
                      </div>
                    </template>
                  </RecordListItem>
                </template>
                <template #name-cell="{ row }">
                  <span class="font-medium">{{ row.original.name }}</span>
                </template>
                <template #level-cell="{ row }">
                  <span class="tabular-nums">{{ row.original.level === null ? '' : signedAmount(row.original, row.original.level) }}</span>
                </template>
                <template #count-cell="{ row }">
                  <UFieldGroup v-if="entries[row.original.id]">
                    <FieldNumber
                      v-model="entries[row.original.id]!.count"
                      :min="0"
                      :step="row.original.countUnitSize === 1 ? 1 : 0.1"
                      :format-options="{ maximumFractionDigits: row.original.countUnitSize === 1 ? 0 : 2 }"
                      :aria-label="row.original.weighable ? t('bar.screens.stocktakes.full-of', { name: row.original.name }) : t('bar.screens.stocktakes.count-of', { name: row.original.name })"
                    />
                    <UBadge
                      color="neutral"
                      variant="outline"
                      size="lg"
                      :label="row.original.weighable ? t('bar.screens.stocktakes.full', { unit: countWord(row.original, 2) }) : countWord(row.original, 2)"
                    />
                  </UFieldGroup>
                </template>
                <template #weighed-cell="{ row }">
                  <UFieldGroup v-if="row.original.weighable && entries[row.original.id]">
                    <FieldNumber
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
                <template #total-cell="{ row }">
                  <span class="text-sm tabular-nums">{{ workedText(row.original) }}</span>
                </template>
                <template #remove-cell="{ row }">
                  <IconButton
                    icon="i-lucide-x"
                    :label="t('bar.screens.stocktakes.take-out', { name: row.original.name })"
                    @click="takeOut(row.original)"
                  />
                </template>
              </TableOrList>
            </PageSection>
          </UForm>

          <PageSection
            v-else-if="showReview"
            :title="t('bar.screens.stocktakes.review')"
            :description="d.stocktake.state === 'submitted' ? t('bar.screens.stocktakes.review-help', { amount: money(d.reasonOverMinor) }) : undefined"
          >
            <!-- On a phone: one item a row, with its reason under it where it differs. -->
            <TableOrList
              :rows="d.lines"
              :columns="reviewColumns"
              :label="t('bar.screens.stocktakes.review')"
            >
              <template #item="{ row: l }">
                <RecordListItem
                  :name="l.name"
                  :description="[l.expected === null ? null : t('bar.screens.stocktakes.expected-is', { amount: signedAmount(l, l.expected) }), l.counted === null ? null : t('bar.screens.stocktakes.counted-is', { amount: signedAmount(l, l.counted) })].filter(Boolean).join(' · ')"
                >
                  <span class="text-right text-sm">
                    <span
                      v-if="differs(l)"
                      :class="['block tabular-nums', l.counted! < l.expected! ? 'text-error' : 'text-success']"
                    >{{ l.counted! > l.expected! ? '+' : '' }}{{ signedAmount(l, l.counted! - l.expected!) }}</span>
                    <span
                      v-else
                      class="block text-muted"
                    >{{ t('bar.screens.stocktakes.matches') }}</span>
                    <span
                      v-if="l.varianceValueMinor"
                      class="block tabular-nums text-muted"
                    >{{ money(l.varianceValueMinor) }}</span>
                  </span>
                  <template
                    v-if="differs(l)"
                    #below
                  >
                    <UFormField
                      v-if="d.stocktake.state === 'submitted'"
                      :label="t('bar.screens.stocktakes.reason-for', { name: l.name })"
                      :name="`reason-${l.id}`"
                      :error="reasonError(l)"
                      :ui="{ label: 'sr-only' }"
                    >
                      <USelectMenu
                        :model-value="l.reasonTermId ?? NONE"
                        :items="reasonItems"
                        value-key="value"
                        @update:model-value="v => setReason(l, v as string)"
                      />
                    </UFormField>
                    <p
                      v-else-if="l.reasonTermId"
                      class="text-sm text-muted"
                    >
                      {{ reasonLabel(l.reasonTermId) }}
                    </p>
                  </template>
                </RecordListItem>
              </template>
              <template #name-cell="{ row }">
                <span class="font-medium">{{ row.original.name }}</span>
                <span
                  v-if="d.stocktake.state !== 'submitted' && row.original.reasonTermId"
                  class="block text-sm text-muted"
                >{{ reasonLabel(row.original.reasonTermId) }}</span>
              </template>
              <template #expected-cell="{ row }">
                <span class="tabular-nums">{{ row.original.expected === null ? '' : signedAmount(row.original, row.original.expected) }}</span>
              </template>
              <template #counted-cell="{ row }">
                <span class="tabular-nums">{{ row.original.counted === null ? '' : signedAmount(row.original, row.original.counted) }}</span>
              </template>
              <template #difference-cell="{ row }">
                <span
                  v-if="differs(row.original)"
                  :class="['tabular-nums', row.original.counted! < row.original.expected! ? 'text-error' : 'text-success']"
                >{{ row.original.counted! > row.original.expected! ? '+' : '' }}{{ signedAmount(row.original, row.original.counted! - row.original.expected!) }}</span>
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
                  :error="reasonError(row.original)"
                  :ui="{ label: 'sr-only' }"
                >
                  <USelectMenu
                    :model-value="row.original.reasonTermId ?? NONE"
                    :items="reasonItems"
                    class="min-w-40"
                    value-key="value"
                    @update:model-value="v => setReason(row.original, v as string)"
                  />
                </UFormField>
              </template>
            </TableOrList>
          </PageSection>
          <p
            v-else-if="d.stocktake.state === 'submitted'"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.stocktakes.waiting') }}
          </p>
          <p
            v-if="d.stocktake.state === 'submitted' && d.can.approve && d.can.ownCount"
            class="text-sm text-muted"
          >
            {{ t('bar.screens.stocktakes.own-count', { amount: money(Math.abs(d.stocktake.varianceValueMinor ?? 0)), limit: money(d.selfApproveUnderMinor) }) }}
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
          <span
            class="text-sm text-muted"
            role="status"
          >{{ saving ? t('bar.screens.stocktakes.saving') : t('bar.screens.stocktakes.saves-as-typed') }}</span>
        </template>
        <template v-else-if="data?.can.approve">
          <UButton
            v-if="!data.can.ownCount"
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
