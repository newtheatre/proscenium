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
const { toRefusal, fieldErrors } = useRefusal()
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
async function onHandleKey(event: KeyboardEvent, l: Line) {
  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!by) return
  event.preventDefault()
  move(l, by)
  await nextTick()
  document.querySelector<HTMLElement>(`[data-drag-handle="${l.id}"]`)?.focus()
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

// Revising an approved line: below what is spent and committed, the treasurer confirms.
const revising = ref<Line | null>(null)
const revise = reactive({ amountMinor: 0 as number | null, reason: '', confirm: false })
const reviseEl = useFormRef('reviseEl')
const reviseRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openRevise(l: Line) {
  Object.assign(revise, { amountMinor: l.figures.budgetedMinor, reason: '', confirm: false })
  reviseRefusal.value = null
  revising.value = l
}
async function saveRevise() {
  reviseRefusal.value = null
  try {
    await $api(`/api/budgets/lines/${revising.value!.id}/revise` as string, { method: 'POST', body: { amountMinor: revise.amountMinor ?? 0, reason: revise.reason.trim(), confirm: revise.confirm || undefined } })
    revising.value = null
    toast.add({ title: t('budgets.screens.revise.done'), color: 'success' })
    await reload()
  }
  catch (e) {
    reviseRefusal.value = toRefusal(e)
    reviseEl.value?.setErrors(fieldErrors(reviseRefusal.value))
  }
}
const belowSpent = computed(() => reviseRefusal.value?.code === 'budgets.line.below-spent')
const historyOf = (lineId: string) => (data.value?.history ?? []).filter(h => h.lineId === lineId)

function lineActions(l: Line): DropdownMenuItem[] {
  if (!editable.value) return []
  const items: DropdownMenuItem[] = [{ label: t('budgets.screens.line.edit'), icon: 'i-lucide-pencil', onSelect: () => editLine(l) }]
  if (b.value?.state === 'approved') items.push({ label: t('budgets.screens.revise.title'), icon: 'i-lucide-scale', onSelect: () => openRevise(l) })
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
const note = ref('')
const noteEl = useFormRef('noteEl')
const noteRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openNote(kind: 'send-back' | 'reopen') {
  note.value = ''
  noteRefusal.value = null
  noting.value = kind
}
async function saveNote() {
  noteRefusal.value = null
  try {
    await $api(`/api/budgets/budgets/${id.value}/${noting.value}` as string, { method: 'POST', body: { note: note.value.trim() } })
    toast.add({ title: t(`budgets.screens.${noting.value}.done`), color: 'success' })
    noting.value = null
    await reload()
  }
  catch (e) {
    noteRefusal.value = toRefusal(e)
    noteEl.value?.setErrors(fieldErrors(noteRefusal.value))
  }
}
const renaming = ref(false)
const rename = ref('')
const renameEl = useFormRef('renameEl')
const renameRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openRename() {
  rename.value = b.value?.name ?? ''
  renameRefusal.value = null
  renaming.value = true
}
async function saveRename() {
  renameRefusal.value = null
  try {
    await $api(`/api/budgets/budgets/${id.value}` as string, { method: 'PATCH', body: { name: rename.value.trim() } })
    renaming.value = false
    await reload()
  }
  catch (e) {
    renameRefusal.value = toRefusal(e)
    renameEl.value?.setErrors(fieldErrors(renameRefusal.value))
  }
}

const pageActions = computed(() => {
  const v = data.value
  if (!v || !b.value) return []
  const out: { label: string, icon?: string, lesser?: boolean, disabled?: boolean, onSelect: () => unknown }[] = []
  const state = b.value.state
  if (state === 'draft' && v.canManage) out.push({ label: t('budgets.screens.propose.action'), icon: 'i-lucide-send', disabled: !expenses.value.concat(incomes.value).some(l => l.draftMinor > 0), onSelect: () => step('propose', 'budgets.screens.propose.done') })
  if (state === 'proposed' && v.canApprove) {
    if (!v.ownProposal) out.push({ label: t('budgets.screens.approve.action'), icon: 'i-lucide-check', onSelect: () => step('approve', 'budgets.screens.approve.done') })
    out.push({ label: t('budgets.screens.send-back.action'), icon: 'i-lucide-undo-2', lesser: true, onSelect: () => openNote('send-back') })
  }
  if (state === 'approved' && v.canApprove) out.push({ label: t('budgets.screens.close.action'), icon: 'i-lucide-lock', lesser: true, onSelect: () => step('close', 'budgets.screens.close.done') })
  if (state === 'closed' && v.canApprove) out.push({ label: t('budgets.screens.reopen.action'), icon: 'i-lucide-lock-open', lesser: true, onSelect: () => openNote('reopen') })
  if (state !== 'closed' && v.canManage) out.push({ label: t('budgets.screens.rename.action'), icon: 'i-lucide-pencil', lesser: true, onSelect: openRename })
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

        <PageSection :title="t('budgets.screens.budget.spending')">
          <template
            v-if="editable"
            #actions
          >
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              :label="t('budgets.screens.line.add-expense')"
              @click="addLine('expense')"
            />
          </template>
          <p
            v-if="!expenses.length"
            class="text-muted"
          >
            {{ t('budgets.screens.budget.no-spending') }}
          </p>
          <SortableList
            v-else-if="editable"
            :label="t('budgets.screens.budget.spending')"
            @reorder="reorder('expense', $event)"
          >
            <SortableRow
              v-for="(l, position) in expenses"
              :id="l.id"
              :key="l.id"
              :index="position"
              :name="l.name"
              :description="describe(l)"
            >
              <template #leading>
                <IconButton
                  :data-drag-handle="l.id"
                  icon="i-lucide-grip-vertical"
                  size="sm"
                  class="cursor-grab touch-none"
                  :label="t('budgets.screens.line.handle', { name: l.name })"
                  @keydown="onHandleKey($event, l)"
                />
              </template>
              <template #below>
                <UProgress
                  :model-value="share(l)"
                  :color="l.figures.over ? 'warning' : 'primary'"
                  size="xs"
                  class="mt-2 max-w-64"
                  :aria-label="describe(l)"
                />
              </template>
              <RowActions
                :items="lineActions(l)"
                :label="t('budgets.screens.line.actions', { name: l.name })"
              />
            </SortableRow>
          </SortableList>
          <RecordList
            v-else
            :label="t('budgets.screens.budget.spending')"
          >
            <RecordListItem
              v-for="l in expenses"
              :key="l.id"
              :name="l.name"
              :description="describe(l)"
            >
              <template #below>
                <UProgress
                  :model-value="share(l)"
                  :color="l.figures.over ? 'warning' : 'primary'"
                  size="xs"
                  class="mt-2 max-w-64"
                  :aria-label="describe(l)"
                />
              </template>
            </RecordListItem>
          </RecordList>
        </PageSection>

        <PageSection
          v-if="incomes.length || editable"
          :title="t('budgets.screens.budget.income')"
          :description="t('budgets.screens.budget.income-help')"
        >
          <template
            v-if="editable"
            #actions
          >
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-plus"
              :label="t('budgets.screens.line.add-income')"
              @click="addLine('income')"
            />
          </template>
          <p
            v-if="!incomes.length"
            class="text-muted"
          >
            {{ t('budgets.screens.budget.no-income') }}
          </p>
          <SortableList
            v-else-if="editable"
            :label="t('budgets.screens.budget.income')"
            @reorder="reorder('income', $event)"
          >
            <SortableRow
              v-for="(l, position) in incomes"
              :id="l.id"
              :key="l.id"
              :index="position"
              :name="l.name"
              :description="describe(l)"
            >
              <template #leading>
                <IconButton
                  :data-drag-handle="l.id"
                  icon="i-lucide-grip-vertical"
                  size="sm"
                  class="cursor-grab touch-none"
                  :label="t('budgets.screens.line.handle', { name: l.name })"
                  @keydown="onHandleKey($event, l)"
                />
              </template>
              <RowActions
                :items="lineActions(l)"
                :label="t('budgets.screens.line.actions', { name: l.name })"
              />
            </SortableRow>
          </SortableList>
          <RecordList
            v-else
            :label="t('budgets.screens.budget.income')"
          >
            <RecordListItem
              v-for="l in incomes"
              :key="l.id"
              :name="l.name"
              :description="describe(l)"
            />
          </RecordList>
        </PageSection>

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

    <UModal
      :open="!!revising"
      :title="t('budgets.screens.revise.title')"
      :description="revising ? t('budgets.screens.revise.help', { name: revising.name }) : undefined"
      @update:open="(v: boolean) => { if (!v) revising = null }"
    >
      <template #body>
        <UForm
          id="budgets-revise"
          ref="reviseEl"
          :state="revise"
          :validate="() => needs({ amountMinor: revise.amountMinor, reason: revise.reason, confirm: belowSpent ? revise.confirm : true })"
          class="space-y-4"
          novalidate
          @submit="saveRevise"
        >
          <RefusalNotice :refusal="reviseRefusal" />
          <UFormField
            name="amountMinor"
            :label="t('budgets.screens.revise.amount')"
            required
          >
            <FieldMoney
              v-model="revise.amountMinor"
              :currency="b?.currency"
            />
          </UFormField>
          <UFormField
            name="reason"
            :label="t('budgets.screens.revise.reason')"
            required
          >
            <UInput
              v-model="revise.reason"
              maxlength="200"
            />
          </UFormField>
          <UFormField
            v-if="belowSpent"
            name="confirm"
          >
            <UCheckbox
              v-model="revise.confirm"
              :label="t('budgets.screens.revise.confirm', { amount: money(Number(reviseRefusal?.detail?.floorMinor ?? 0)) })"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="budgets-revise"
          :loading="reviseEl?.loading"
          :label="t('budgets.screens.revise.save')"
        />
      </template>
    </UModal>

    <UModal
      :open="!!noting"
      :title="noting ? t(`budgets.screens.${noting}.title`) : undefined"
      :description="noting ? t(`budgets.screens.${noting}.help`) : undefined"
      @update:open="(v: boolean) => { if (!v) noting = null }"
    >
      <template #body>
        <UForm
          id="budgets-note"
          ref="noteEl"
          :state="{ note }"
          :validate="() => needs({ note })"
          class="space-y-4"
          novalidate
          @submit="saveNote"
        >
          <RefusalNotice :refusal="noteRefusal" />
          <UFormField
            name="note"
            :label="t('budgets.screens.note')"
            required
          >
            <UTextarea
              v-model="note"
              :rows="3"
              maxlength="300"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="budgets-note"
          :loading="noteEl?.loading"
          :label="noting ? t(`budgets.screens.${noting}.action`) : ''"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="renaming"
      :title="t('budgets.screens.rename.action')"
    >
      <template #body>
        <UForm
          id="budgets-rename"
          ref="renameEl"
          :state="{ name: rename }"
          :validate="() => needs({ name: rename })"
          class="space-y-4"
          novalidate
          @submit="saveRename"
        >
          <RefusalNotice :refusal="renameRefusal" />
          <UFormField
            name="name"
            :label="t('budgets.screens.new.name')"
            required
          >
            <UInput
              v-model="rename"
              maxlength="80"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="budgets-rename"
          :loading="renameEl?.loading"
          :label="t('budgets.screens.line.save')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
