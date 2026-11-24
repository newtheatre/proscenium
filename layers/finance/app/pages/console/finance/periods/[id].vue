<!-- One period (Box office specification, part 5): its totals, the close checklist (each thing that
     stops it closing, linked to where it is fixed) and Close. A closed period is reopened with a
     reason from the theatre's list. -->
<script setup lang="ts">
interface Period { id: string, label: string, startsOn: string, endsOn: string, closed: boolean, debitsMinor: number, creditsMinor: number }
interface Blocker { sentence: string, to?: string, module: string }
interface Held { accountId: string, code: string, name: string, currency: string, amountMinor: number }
interface Movement { accountId: string, code: string, name: string, kind: 'income' | 'expense', currency: string, amountMinor: number }

const { t } = useT()
const { $api } = useNuxtApp()
const route = useRoute()
const { money, currency } = await useMoney()
const { confirm } = useConfirm()
const { toRefusal } = useRefusal()
const toast = useToast()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<{ period: Period, blockers: Blocker[], warnings?: Blocker[], movement: Movement[], held?: Held[], ended?: boolean, closableFrom?: string, canClose: boolean, canReopen: boolean }>(() => `/api/finance/periods/${id.value}`, { key: `finance:period:${id.value}` })
const { dayLong: dateOf } = useDates()

// The chart is in the theatre's own currency; anything in another stays in the list beneath it.
const moved = computed(() => (data.value?.movement ?? []).filter(m => m.currency === currency.value))
const bars = computed(() => moved.value.map(m => ({ account: m.name, income: m.kind === 'income' ? m.amountMinor : 0, expense: m.kind === 'expense' ? m.amountMinor : 0 })))
// Money taken in the period that is not income yet, in the theatre's own currency.
const held = computed(() => (data.value?.held ?? []).filter(h => h.currency === currency.value))
// A period still running is early, not blocked.
const running = computed(() => !!data.value && !data.value.period.closed && data.value.ended === false)
const total = (kind: Movement['kind']) => moved.value.filter(m => m.kind === kind).reduce((sum, m) => sum + m.amountMinor, 0)

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const busy = ref(false)
async function close() {
  const p = data.value?.period
  if (!p) return
  const ok = await confirm({ verb: t('finance.screens.period.close-verb'), thing: p.label, consequence: t('finance.screens.period.close-consequence'), button: t('finance.screens.period.close-button') })
  if (!ok) return
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/finance/periods/${p.id}/close` as string, { method: 'POST', body: {} })
    toast.add({ title: t('finance.screens.period.closed', { period: p.label }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    await refresh()
  }
  finally {
    busy.value = false
  }
}

const reopening = ref(false)
const reason = ref<string | undefined>(undefined)
const { data: reasons, execute: loadReasons } = useAPI<{ reasons: { id: string, label: string }[] }>('/api/finance/periods/reopen-reasons', { key: 'finance:reopen-reasons', immediate: false, default: () => ({ reasons: [] }) })
async function openReopen() {
  reason.value = undefined
  refusal.value = null
  reopening.value = true
  await loadReasons()
}
async function reopen() {
  const p = data.value?.period
  if (!p || !reason.value) return
  busy.value = true
  refusal.value = null
  try {
    await $api(`/api/finance/periods/${p.id}/reopen` as string, { method: 'POST', body: { reasonTermId: reason.value } })
    reopening.value = false
    toast.add({ title: t('finance.screens.period.reopened', { period: p.label }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <PageFrame
    :title="data?.period.label ?? t('finance.navigation.periods.label')"
    width="reading"
  >
    <template
      v-if="data"
      #status
    >
      <StatusBadge
        :tone="data.period.closed ? 'neutral' : 'success'"
        :label="t(data.period.closed ? 'finance.screens.periods.closed' : 'finance.screens.periods.open')"
      />
    </template>
    <template
      v-if="data"
      #primary
    >
      <UButton
        v-if="!data.period.closed && data.canClose && !running"
        :label="t('finance.screens.period.close-button')"
        icon="i-lucide-lock"
        :disabled="data.blockers.length > 0"
        :loading="busy"
        @click="close"
      />
      <UButton
        v-else-if="data.period.closed && data.canReopen"
        :label="t('finance.screens.period.reopen-button')"
        icon="i-lucide-lock-open"
        color="neutral"
        variant="outline"
        @click="openReopen"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: loaded }">
        <div class="space-y-6">
          <RefusalNotice
            v-if="!reopening"
            :refusal="refusal"
          />
          <FactStrip
            :facts="[
              { label: t('finance.screens.period.dates'), value: t('finance.screens.periods.range', { from: dateOf(loaded.period.startsOn), to: dateOf(loaded.period.endsOn) }), strong: false },
              { label: t('finance.screens.period.income'), value: money(total('income')) },
              { label: t('finance.screens.period.expenses'), value: money(total('expense')) },
            ]"
          />
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span :title="t('finance.screens.period.posted-help')">{{ t('finance.screens.periods.moved', { amount: money(loaded.period.debitsMinor) }) }}</span>
            <UButton
              :to="{ path: '/console/finance/ledger', query: { period: loaded.period.id } }"
              :label="t('finance.screens.period.postings')"
              icon="i-lucide-book-open"
              color="neutral"
              variant="link"
              class="px-0"
            />
          </div>

          <UAlert
            v-if="running && loaded.closableFrom"
            color="neutral"
            variant="subtle"
            icon="i-lucide-calendar-clock"
            :title="t('finance.screens.period.running', { day: dateOf(loaded.closableFrom) })"
            :description="t('finance.screens.period.running-help')"
          />
          <PageSection
            v-else-if="!loaded.period.closed"
            :title="t('finance.screens.period.checklist')"
            :description="t('finance.screens.period.checklist-help')"
          >
            <FinanceCloseChecklist
              :blockers="loaded.blockers"
              :warnings="loaded.warnings"
            />
          </PageSection>

          <PageSection
            v-if="held.length"
            :title="t('finance.screens.period.held')"
            :description="t('finance.screens.period.held-help')"
          >
            <RecordList :label="t('finance.screens.period.held')">
              <RecordListItem
                v-for="h in held"
                :key="h.accountId"
                :name="h.name"
                :description="h.code"
              >
                <span class="font-medium tabular-nums">{{ money(h.amountMinor, h.currency) }}</span>
              </RecordListItem>
            </RecordList>
          </PageSection>

          <PageSection
            v-if="loaded.movement.length"
            :title="t('finance.screens.period.movement')"
            :description="t('finance.screens.period.movement-help')"
          >
            <div class="space-y-4">
              <ChartFigure
                v-if="bars.length > 1"
                :title="t('finance.screens.period.movement-chart')"
                :summary="t('finance.screens.period.movement-summary', { income: money(total('income')), expense: money(total('expense')) })"
                :data="bars"
                index="account"
                :categories="[{ key: 'income', label: t('finance.screens.accounts.kinds.income') }, { key: 'expense', label: t('finance.screens.accounts.kinds.expense') }]"
                :format="(value: number) => money(value)"
                stacked
              />
              <RecordList>
                <RecordListItem
                  v-for="m in loaded.movement"
                  :key="`${m.accountId}:${m.currency}`"
                  :name="m.name"
                  :description="`${m.code} · ${t(`finance.screens.accounts.kinds.${m.kind}`)}`"
                >
                  <span class="font-medium tabular-nums">{{ money(m.amountMinor, m.currency) }}</span>
                </RecordListItem>
              </RecordList>
            </div>
          </PageSection>
        </div>
      </template>
    </DataBoundary>

    <UModal
      v-model:open="reopening"
      :title="t('finance.screens.period.reopen-title', { period: data?.period.label ?? '' })"
      :description="t('finance.screens.period.reopen-help')"
    >
      <template #body>
        <UForm
          id="reopen-period"
          :state="{ reason }"
          :validate="() => needs({ reason })"
          class="space-y-4"
          novalidate
          @submit="reopen"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="reason"
            :label="t('finance.screens.period.reason')"
            required
          >
            <USelectMenu
              v-model="reason"
              value-key="value"
              :items="reasons?.reasons.map(r => ({ value: r.id, label: r.label })) ?? []"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="reopen-period"
          :loading="busy"
          :label="t('finance.screens.period.reopen-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
