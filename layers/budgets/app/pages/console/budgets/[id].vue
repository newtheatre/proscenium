<!-- One budget: each line with what it plans, what is committed, what has been spent and what is
     left, its income lines beside what has come in, and the budgets it funds. A draft is edited here,
     lines dragged into order, then proposed; someone else approves it or sends it back with a note.
     An approved line's amount is revised with a reason, and every approved amount stays in its history. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

type BudgetState = 'draft' | 'proposed' | 'approved' | 'closed'
interface LineInput { id: string, name: string, kind: 'expense' | 'income', categoryId: string | null, sources: string[], draftMinor: number }
interface Figures { budgetedMinor: number, committedMinor: number, pendingMinor: number, actualMinor: number, remainingMinor: number, over: boolean }
interface Line extends LineInput { sortOrder: number, archivedAt: number | null, approvedMinor: number | null, figures: Figures }
interface Budget { id: string, name: string, scope: string, state: BudgetState, currency: string, yearStartsOn: string, note: string | null, parentLineId: string | null }
interface Totals { budgetedMinor: number, committedMinor: number, actualMinor: number, remainingMinor: number, incomeBudgetedMinor: number, incomeActualMinor: number }
interface Sub { id: string, name: string, state: BudgetState, parentLineId: string, totalMinor: number }
interface History { lineId: string, amountMinor: number, reason: string | null, setAt: number }
interface View {
  budget: Budget
  lines: Line[]
  subBudgets: Sub[]
  parent: { lineId: string, lineName: string, budgetId: string, budgetName: string } | null
  totals: Totals
  history: History[]
  subject: { label: string, to: string | null } | null
  holders: { accountId: string, name: string, addedAt: number }[]
  closeDue: boolean
  canManage: boolean
  canApprove: boolean
  holds: boolean
  ownProposal: boolean
}

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const toast = useToast()
const { offer } = useUndo()
const text = useBudgetText()
const { data, status, error, refresh } = await useAPI<View>(() => `/api/budgets/budgets/${id.value}`, { key: `budgets:budget:${id.value}` })
const { data: categoryData } = await useAPI<{ categories: { id: string, name: string, archivedAt: number | null }[] }>('/api/budgets/categories', { key: 'budgets:categories' })
const { data: sourceData } = await useAPI<{ sources: { key: string, name: string }[] }>('/api/budgets/sources', { key: 'budgets:sources' })
const b = computed(() => data.value?.budget)
const money = (minor: number) => text.money(minor, b.value?.currency ?? 'GBP')
const editable = computed(() => !!data.value && ((b.value?.state === 'draft' && data.value.canManage) || (b.value?.state === 'approved' && data.value.canApprove)))
const categoryName = (cid: string | null) => categoryData.value?.categories.find(c => c.id === cid)?.name ?? ''
const sourceName = (key: string) => sourceData.value?.sources.find(s => s.key === key)?.name ?? key

const facts = computed(() => {
  const v = data.value
  if (!v || !b.value) return []
  return [
    { label: t('budgets.screens.figures.budgeted'), value: money(v.totals.budgetedMinor), strong: true },
    { label: t('budgets.screens.figures.committed'), value: money(v.totals.committedMinor) },
    { label: t('budgets.screens.figures.spent'), value: money(v.totals.actualMinor) },
    { label: t('budgets.screens.figures.remaining'), value: v.totals.remainingMinor < 0 ? t('budgets.screens.over-by', { amount: money(-v.totals.remainingMinor) }) : money(v.totals.remainingMinor) },
    ...(v.lines.some(l => l.kind === 'income') ? [{ label: t('budgets.screens.figures.income'), value: t('budgets.screens.figures.income-of', { received: money(v.totals.incomeActualMinor), planned: money(v.totals.incomeBudgetedMinor) }) }] : []),
    { label: t('budgets.screens.budget.year'), value: text.year(b.value.yearStartsOn) },
    ...(v.holds ? [{ label: t('budgets.screens.holders.title'), value: t('budgets.screens.holders.you') }] : []),
    ...(v.subject ? [{ label: t(`budgets.screens.scopes.${b.value.scope}`), value: v.subject.label, to: v.subject.to ?? undefined }] : []),
    ...(v.parent ? [{ label: t('budgets.screens.budget.funded-from'), value: `${v.parent.budgetName}: ${v.parent.lineName}`, to: `/console/budgets/${v.parent.budgetId}` }] : []),
  ]
})

// Lines in the order shown: a drag moves the row here first, then the whole order is saved.
const ordered = ref<Line[]>([])
watch(() => data.value?.lines, (lines) => { ordered.value = (lines ?? []).filter(l => !l.archivedAt) }, { immediate: true })
const expenses = computed(() => ordered.value.filter(l => l.kind === 'expense'))
const incomes = computed(() => ordered.value.filter(l => l.kind === 'income'))
const archived = computed(() => (data.value?.lines ?? []).filter(l => l.archivedAt))
const showArchived = ref(false)

function describe(l: Line) {
  const f = l.figures
  if (l.kind === 'income') {
    const from = l.sources.map(sourceName).join(', ')
    return [t('budgets.screens.figures.income-of', { received: money(f.actualMinor), planned: money(f.budgetedMinor) }), from].filter(Boolean).join(' · ')
  }
  return [
    categoryName(l.categoryId),
    t('budgets.screens.line.figures', { budgeted: money(f.budgetedMinor), committed: money(f.committedMinor), spent: money(f.actualMinor) }),
    f.over ? t('budgets.screens.over-by', { amount: money(-f.remainingMinor) }) : t('budgets.screens.line.left', { amount: money(f.remainingMinor) }),
  ].filter(Boolean).join(' · ')
}
const share = (l: Line) => l.figures.budgetedMinor ? Math.min(100, Math.round(100 * (l.figures.actualMinor + l.figures.committedMinor) / l.figures.budgetedMinor)) : (l.figures.actualMinor ? 100 : 0) // not-policy: a percentage

function complain(e: unknown) {
  const r = toRefusal(e)
  toast.add({ title: r.reason, description: r.remedy, color: 'error' })
}
async function reload() {
  await Promise.all([refresh(), refreshNuxtData('budgets:list')])
}

async function saveOrder() {
  const lineIds = [...expenses.value, ...incomes.value].map(l => l.id)
  try {
    await $api(`/api/budgets/budgets/${id.value}/order` as string, { method: 'PUT', body: { lineIds } })
  }
  catch (e) {
    complain(e)
  }
  await refresh()
}
function reorder(kind: 'expense' | 'income', { id: lineId, from, to }: { id: string, from: number, to: number }) {
  const group = ordered.value.filter(l => l.kind === kind)
  const [moved] = group.splice(from, 1)
  if (!moved || moved.id !== lineId) return
  group.splice(to, 0, moved)
  ordered.value = kind === 'expense' ? [...group, ...incomes.value] : [...expenses.value, ...group]
  saveOrder()
}
function move(l: Line, by: -1 | 1) {
  const group = ordered.value.filter(x => x.kind === l.kind)
  const from = group.findIndex(x => x.id === l.id)
  if (from + by < 0 || from + by >= group.length) return
  reorder(l.kind, { id: l.id, from, to: from + by })
}
// Adding and editing lines.
const lineOpen = ref(false)
const lineEditing = ref<Line | null>(null)
const lineKind = ref<'expense' | 'income'>('expense')
function addLine(kind: 'expense' | 'income') {
  lineEditing.value = null
  lineKind.value = kind
  lineOpen.value = true
}
function editLine(l: Line) {
  lineEditing.value = l
  lineOpen.value = true
}
async function setArchived(l: Line, archived: boolean) {
  try {
    await $api(`/api/budgets/lines/${l.id}` as string, { method: 'PATCH', body: { archived } })
    if (archived) offer(t('budgets.screens.line.archived-toast', { name: l.name }), () => setArchived(l, false))
    await refresh()
  }
  catch (e) {
    complain(e)
  }
}

const revising = ref<Line | null>(null)
async function revised() {
  revising.value = null
  toast.add({ title: t('budgets.screens.revise.done'), color: 'success' })
  await reload()
}
const historyOf = (lineId: string) => (data.value?.history ?? []).filter(h => h.lineId === lineId)

function lineActions(l: Line): DropdownMenuItem[] {
  if (!editable.value) return []
  const items: DropdownMenuItem[] = [{ label: t('budgets.screens.line.edit'), icon: 'i-lucide-pencil', onSelect: () => editLine(l) }]
  if (b.value?.state === 'approved') items.push({ label: t('budgets.screens.revise.title'), icon: 'i-lucide-scale', onSelect: () => { revising.value = l } })
  const group = ordered.value.filter(x => x.kind === l.kind)
  const at = group.findIndex(x => x.id === l.id)
  items.push(
    { label: t('budgets.screens.line.up'), icon: 'i-lucide-arrow-up', disabled: at <= 0, onSelect: () => move(l, -1) },
    { label: t('budgets.screens.line.down'), icon: 'i-lucide-arrow-down', disabled: at >= group.length - 1, onSelect: () => move(l, 1) },
    { label: t('budgets.screens.line.archive'), icon: 'i-lucide-archive', onSelect: () => setArchived(l, true) },
  )
  return items
}

// Moving the budget along: propose, approve, send back, close, reopen.
async function step(path: string, done: string) {
  try {
    await $api(`/api/budgets/budgets/${id.value}/${path}` as string, { method: 'POST', body: {} })
    toast.add({ title: t(done), color: 'success' })
    await reload()
  }
  catch (e) {
    complain(e)
  }
}
const noting = ref<'send-back' | 'reopen' | null>(null)
const renaming = ref(false)
async function noted(kind: 'send-back' | 'reopen') {
  toast.add({ title: t(`budgets.screens.${kind}.done`), color: 'success' })
  await reload()
}

const pageActions = computed(() => {
  const v = data.value
  if (!v || !b.value) return []
  const out: { label: string, icon?: string, lesser?: boolean, disabled?: boolean, onSelect: () => unknown }[] = []
  const state = b.value.state
  if (state === 'draft' && v.canManage) out.push({ label: t('budgets.screens.propose.action'), icon: 'i-lucide-send', disabled: !expenses.value.concat(incomes.value).some(l => l.draftMinor > 0), onSelect: () => step('propose', 'budgets.screens.propose.done') })
  if (state === 'proposed' && v.canApprove) {
    if (!v.ownProposal) out.push({ label: t('budgets.screens.approve.action'), icon: 'i-lucide-check', onSelect: () => step('approve', 'budgets.screens.approve.done') })
    out.push({ label: t('budgets.screens.send-back.action'), icon: 'i-lucide-undo-2', lesser: true, onSelect: () => { noting.value = 'send-back' } })
  }
  if (state === 'approved' && v.canApprove) out.push({ label: t('budgets.screens.close.action'), icon: 'i-lucide-lock', lesser: true, onSelect: () => step('close', 'budgets.screens.close.done') })
  if (state === 'closed' && v.canApprove) out.push({ label: t('budgets.screens.reopen.action'), icon: 'i-lucide-lock-open', lesser: true, onSelect: () => { noting.value = 'reopen' } })
  if (state !== 'closed' && v.canManage) out.push({ label: t('budgets.screens.rename.action'), icon: 'i-lucide-pencil', lesser: true, onSelect: () => { renaming.value = true } })
  return out
})
</script>

<template>
  <PageFrame
    :title="b?.name ?? t('budgets.navigation.budgets.label')"
    :trail="[{ label: t('budgets.navigation.budgets.label'), to: '/console/budgets' }]"
  >
    <template
      v-if="b"
      #status
    >
      <StatusBadge v-bind="text.state(b.state)" />
    </template>
    <template
      v-if="b"
      #primary
    >
      <PageActions :actions="pageActions" />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data && b"
        class="space-y-6"
      >
        <UAlert
          v-if="b.note && (b.state === 'draft' || b.state === 'approved')"
          color="info"
          variant="subtle"
          icon="i-lucide-message-square"
          :title="t(b.state === 'draft' ? 'budgets.screens.budget.sent-back' : 'budgets.screens.budget.reopened')"
          :description="b.note"
        />
        <UAlert
          v-if="b.state === 'proposed' && data.ownProposal && data.canApprove"
          color="neutral"
          variant="subtle"
          icon="i-lucide-users"
          :title="t('budgets.screens.budget.own-proposal')"
        />
        <UAlert
          v-if="data.closeDue && data.canApprove"
          color="info"
          variant="subtle"
          icon="i-lucide-lock"
          :title="t('budgets.screens.close.due')"
          :description="t('budgets.screens.close.due-help')"
        />
        <FactStrip :facts="facts" />

        <BudgetsLineSection
          :lines="expenses"
          :title="t('budgets.screens.budget.spending')"
          :empty="t('budgets.screens.budget.no-spending')"
          :add-label="t('budgets.screens.line.add-expense')"
          :editable="editable"
          bars
          :describe="describe"
          :share="share"
          :actions="lineActions"
          @add="addLine('expense')"
          @reorder="reorder('expense', $event)"
          @move="move"
        />
        <BudgetsLineSection
          v-if="incomes.length || editable"
          :lines="incomes"
          :title="t('budgets.screens.budget.income')"
          :description="t('budgets.screens.budget.income-help')"
          :empty="t('budgets.screens.budget.no-income')"
          :add-label="t('budgets.screens.line.add-income')"
          :editable="editable"
          :describe="describe"
          :share="share"
          :actions="lineActions"
          @add="addLine('income')"
          @reorder="reorder('income', $event)"
          @move="move"
        />

        <CollapsibleDivider
          v-model:open="showArchived"
          :label="t('budgets.screens.budget.archived')"
          :count="archived.length"
        >
          <RecordList :label="t('budgets.screens.budget.archived')">
            <RecordListItem
              v-for="l in archived"
              :key="l.id"
              :name="l.name"
              :description="describe(l)"
              muted
            >
              <RowActions
                v-if="editable"
                :items="[{ label: t('budgets.screens.line.restore'), icon: 'i-lucide-archive-restore', onSelect: () => setArchived(l, false) }]"
                :label="t('budgets.screens.line.actions', { name: l.name })"
              />
            </RecordListItem>
          </RecordList>
        </CollapsibleDivider>

        <PageSection
          v-if="data.subBudgets.length"
          :title="t('budgets.screens.budget.funds')"
          :description="t('budgets.screens.budget.funds-help')"
        >
          <RecordList :label="t('budgets.screens.budget.funds')">
            <RecordListItem
              v-for="s in data.subBudgets"
              :key="s.id"
              :to="`/console/budgets/${s.id}`"
              icon="i-lucide-piggy-bank"
              :name="s.name"
              :description="`${text.state(s.state).label} · ${money(s.totalMinor)}`"
            />
          </RecordList>
        </PageSection>

        <BudgetsHolders
          v-if="b.state !== 'closed' || data.holders.length"
          :budget-id="b.id"
          :holders="data.holders"
          :can-manage="data.canManage && b.state !== 'closed'"
          @changed="refresh()"
        />

        <PageSection
          v-if="data.history.some(h => h.reason)"
          :title="t('budgets.screens.budget.revisions')"
        >
          <ul class="space-y-2">
            <template
              v-for="l in data.lines"
              :key="l.id"
            >
              <li
                v-for="(h, n) in historyOf(l.id).filter(x => x.reason)"
                :key="`${l.id}-${n}`"
                class="text-sm"
              >
                <span class="font-medium">{{ l.name }}</span>: {{ money(h.amountMinor) }} · {{ h.reason }} · <span class="text-muted">{{ dateTime(h.setAt) }}</span>
              </li>
            </template>
          </ul>
        </PageSection>
      </div>
    </DataBoundary>

    <BudgetsLineDialog
      v-if="b"
      v-model:open="lineOpen"
      :budget-id="b.id"
      :currency="b.currency"
      :approved="b.state === 'approved'"
      :line="lineEditing"
      :kind="lineKind"
      :categories="categoryData?.categories ?? []"
      :sources="sourceData?.sources ?? []"
      @saved="reload()"
    />

    <BudgetsReviseDialog
      :line="revising ? { id: revising.id, name: revising.name, budgetedMinor: revising.figures.budgetedMinor } : null"
      :currency="b?.currency ?? 'GBP'"
      @close="revising = null"
      @revised="revised"
    />
    <BudgetsNoteDialog
      v-if="b"
      v-model:kind="noting"
      :budget-id="b.id"
      @done="noted"
    />
    <BudgetsRenameDialog
      v-if="b"
      v-model:open="renaming"
      :budget-id="b.id"
      :name="b.name"
      @renamed="reload()"
    />
  </PageFrame>
</template>
