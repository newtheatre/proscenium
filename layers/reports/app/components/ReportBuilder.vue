<!-- The report builder (REP-12, REP-33, REP-42, REP-43): figures and formulas in order, a breakdown down
     the side, a pivot across the top, one filter, and who else sees it. Moving a column renumbers the
     formulas that name it. The server checks every rule at once and each fault shows beside its part. -->
<script setup lang="ts">
import type { ColumnEdit } from './ReportColumnDialog.vue'
import { PAGE_BREAKDOWNS, isPageBreakdown, type PeriodRule, type ScopeKind } from '../../shared/reports'

export interface BuilderColumn { measure?: string, formula?: string, label?: string }
export interface BuilderForm {
  kind: 'figures' | 'people'
  name: string
  description: string | null
  basedOn: string | null
  columns: BuilderColumn[]
  rowsBy: string | null
  acrossBy: string | null
  filter: { key: string, values: string[] } | null
  scopeKind: ScopeKind
  scopeId: string | null
  periodRule: PeriodRule
  chart: 'bar' | 'line' | null
  shareRole: string | null
}
interface Figure { id: string, module: string, label: string, unit: string, combine: string, by: string[], filters: string[], ratio: boolean }

const props = defineProps<{ start: BuilderForm, id?: string }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { keyName } = useReportWords()
const toast = useToast()
const { data: catalogue } = await useAPI<{ figures: Figure[], people: Omit<Figure, 'filters' | 'ratio'>[], keys: Record<string, string> }>('/api/reports/catalogue', { key: 'reports:catalogue' })
const { data: roles } = await useAPI<{ roles: { id: string, name: string }[] }>('/api/reports/roles', { key: 'reports:roles' })

const form = reactive<BuilderForm>(structuredClone(toRaw(props.start)))
// Each column keeps a key of its own across moves, so a dragged row stays the same row.
let made = 0
const keys = ref<string[]>(form.columns.map(() => `c${made++}`))
const PEOPLE_MAX = 6 // not-policy: rule P8, figures side by side
const people = computed(() => form.kind === 'people')
const mayPeople = computed(() => !!catalogue.value?.people.length)
const pool = computed<Figure[]>(() => people.value ? (catalogue.value?.people ?? []).map(f => ({ ...f, filters: [], ratio: false })) : catalogue.value?.figures ?? [])
const figures = computed(() => new Map(pool.value.map(f => [f.id, f])))
const chosen = computed(() => form.columns.flatMap(c => c.measure && figures.value.has(c.measure) ? [figures.value.get(c.measure)!] : []))
const keyLabels = computed(() => catalogue.value?.keys ?? {})
const nameOf = (key: string) => keyName(key, keyLabels.value)
const nameable = (key: string) => isPageBreakdown(key) || !!keyLabels.value[key]

// The keys every chosen figure shares: only those can break the whole report down or narrow it (B1, B6).
const shared = (pick: (f: Figure) => string[]) => {
  const [head, ...rest] = chosen.value
  return head ? pick(head).filter(k => nameable(k) && rest.every(f => pick(f).includes(k))) : []
}
const rowKeys = computed(() => [{ value: 'none', label: t('reports.by.none') }, ...shared(f => f.by).map(k => ({ value: k, label: nameOf(k) }))])
const acrossKeys = computed(() => [{ value: 'none', label: t('reports.builder.across-none') }, ...shared(f => f.by).filter(k => (PAGE_BREAKDOWNS as readonly string[]).includes(k) && k !== form.rowsBy).map(k => ({ value: k, label: nameOf(k) }))])
const filterKeys = computed(() => [{ value: 'none', label: t('reports.builder.filter-none') }, ...shared(f => f.filters).map(k => ({ value: k, label: nameOf(k) }))])
const rowsBy = computed({ get: () => form.rowsBy ?? 'none', set: v => form.rowsBy = v === 'none' ? null : v })
const acrossBy = computed({ get: () => form.acrossBy ?? 'none', set: v => form.acrossBy = v === 'none' ? null : v })
const filterKey = computed({
  get: () => form.filter?.key ?? 'none',
  set: v => form.filter = v === 'none' ? null : { key: v, values: [] },
})
const filterIsRecord = computed(() => !!form.filter && isPageBreakdown(form.filter.key) && form.filter.key !== 'day' && form.filter.key !== 'month')
const filterRecord = computed({
  get: () => form.filter?.values[0] ?? null,
  set: (v) => { if (form.filter) form.filter.values = v ? [v] : [] },
})
const { data: filterValues } = useAPI<{ values: { value: string, label: string }[] }>(() => `/api/reports/keys/${form.filter?.key ?? 'none'}/values`, {
  key: computed(() => `reports:key-values:${form.filter?.key ?? ''}`),
  immediate: false,
  watch: [() => form.filter?.key],
  default: () => ({ values: [] }),
})
watch(() => form.filter?.key, (key) => { if (key && !isPageBreakdown(key)) void refreshNuxtData(`reports:key-values:${key}`) }, { immediate: true })

const chartItems = computed(() => [{ value: 'none', label: t('reports.builder.chart-none') }, { value: 'bar', label: t('reports.builder.chart-bar') }, { value: 'line', label: t('reports.builder.chart-line') }])
const chart = computed({ get: () => form.chart ?? 'none', set: v => form.chart = v === 'none' ? null : v as 'bar' | 'line' })
const kindItems = computed(() => [{ value: 'figures', label: t('reports.builder.kind-figures') }, { value: 'people', label: t('reports.builder.kind-people') }])
// A people report has none of the builder's extras (P3, P8), and its figures come from another list.
watch(() => form.kind, () => {
  Object.assign(form, { columns: [], rowsBy: null, acrossBy: null, filter: null, chart: null, shareRole: null })
  keys.value = []
})
watch(() => form.scopeKind, (kind) => {
  form.scopeId = null
  if (kind === 'none' && form.periodRule === 'scope') form.periodRule = 'last-month'
})

// Columns: figures and formulas, each named C and its place.
const columnName = (c: BuilderColumn) => c.measure ? (figures.value.get(c.measure) ? t(figures.value.get(c.measure)!.label) : t('reports.figure-gone')) : c.label ?? ''
const columnLine = (c: BuilderColumn) => c.formula ? `= ${c.formula}` : t('reports.builder.figure-line', { module: t(`${figures.value.get(c.measure ?? '')?.module ?? 'reports'}.module.name`) })

// Formulas name columns by place, so moving one renumbers every formula that names it.
function move(from: number, to: number) {
  if (to < 0 || to >= form.columns.length || from === to) return
  const order = form.columns.map((_, i) => i)
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved!)
  const place = new Map(order.map((old, now) => [old, now]))
  const renumber = (text: string) => text.replace(/[Cc](\d+)/g, (whole, n: string) => place.has(Number(n) - 1) ? `C${place.get(Number(n) - 1)! + 1}` : whole)
  form.columns = order.map(i => ({ ...form.columns[i]!, ...(form.columns[i]!.formula ? { formula: renumber(form.columns[i]!.formula!) } : {}) }))
  keys.value = order.map(i => keys.value[i]!)
}
const onReorder = ({ id, from, to }: { id: string, from: number, to: number }) => { if (keys.value[from] === id) move(from, to) }
function onHandleKey(event: KeyboardEvent, i: number) {
  const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (!by) return
  event.preventDefault()
  const key = keys.value[i]!
  move(i, i + by)
  void nextTick(() => document.querySelector<HTMLElement>(`[data-drag-handle="${key}"]`)?.focus())
}
function remove(i: number) {
  form.columns.splice(i, 1)
  keys.value.splice(i, 1)
}

// Adding or changing a column happens in a small dialog: a figure from the catalogue, or a formula.
const editing = ref<ColumnEdit | null>(null)
const figureItems = computed(() => pool.value.map(f => ({ value: f.id, label: t(f.label), description: t(`${f.module}.module.name`) })))
const earlier = computed(() => form.columns.slice(0, editing.value?.at ?? form.columns.length).map((c, i) => `C${i + 1} ${columnName(c)}`).join(', '))
const addFigure = () => editing.value = { at: null, kind: 'figure', measure: null, formula: '', label: '' }
const addFormula = () => editing.value = { at: null, kind: 'formula', measure: null, formula: '', label: '' }
const edit = (i: number) => {
  const c = form.columns[i]!
  editing.value = { at: i, kind: c.formula ? 'formula' : 'figure', measure: c.measure ?? null, formula: c.formula ?? '', label: c.label ?? '' }
}
function keepColumn() {
  const e = editing.value!
  const column: BuilderColumn = e.kind === 'figure' ? { measure: e.measure! } : { formula: e.formula.trim(), label: e.label.trim() }
  if (e.at === null) {
    form.columns.push(column)
    keys.value.push(`c${made++}`)
  }
  else {
    form.columns[e.at] = column
  }
  editing.value = null
}
const rowItems = (i: number) => [
  { label: t('reports.builder.edit-column'), icon: 'i-lucide-pencil', onSelect: () => edit(i) },
  { label: t('reports.builder.move-up'), icon: 'i-lucide-arrow-up', disabled: i === 0, onSelect: () => move(i, i - 1) },
  { label: t('reports.builder.move-down'), icon: 'i-lucide-arrow-down', disabled: i === form.columns.length - 1, onSelect: () => move(i, i + 1) },
  { label: t('reports.builder.remove-column'), icon: 'i-lucide-trash-2', onSelect: () => remove(i) },
]

// Saving: the server checks the whole report and names each part at fault.
type FormRef = { setErrors: (errors: { name: string, message: string }[]) => void }
const formEl = useTemplateRef<FormRef>('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const columnErrors = computed(() => Object.fromEntries(Object.entries(refusal.value?.fields ?? {}).filter(([k]) => k.startsWith('columns.')).map(([k, v]) => [Number(k.slice('columns.'.length)), v])))
const saving = ref(false)
const validate = () => [...needs({ name: form.name }), ...(form.columns.length ? [] : [{ name: 'columns', message: t('reports.builder.needs-column') }]), ...(form.filter && !form.filter.values.length ? [{ name: 'filter', message: t('reports.builder.needs-filter-value') }] : [])]
async function save() {
  refusal.value = null
  saving.value = true
  try {
    const body = { ...form, description: form.description?.trim() || null }
    const id = props.id
      ? (await $api(`/api/reports/definitions/${props.id}`, { method: 'PUT', body }), props.id)
      : (await $api<{ id: string }>('/api/reports/definitions', { method: 'POST', body })).id
    await refreshNuxtData(['reports:definitions', `reports:definition:${id}`])
    toast.add({ title: t('reports.builder.saved', { name: form.name.trim() }), color: 'success' })
    await navigateTo(`/console/reports/${id}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value).filter(f => !f.name.startsWith('columns.')))
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <UForm
      ref="formEl"
      :state="form"
      :validate="validate"
      class="space-y-8"
      novalidate
      @submit="save"
    >
      <RefusalNotice :refusal="refusal" />
      <PageSection :title="t('reports.builder.about')">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            :label="t('reports.builder.name')"
            name="name"
            required
          >
            <UInput
              v-model="form.name"
            />
          </UFormField>
          <UFormField
            v-if="mayPeople || people"
            :label="t('reports.builder.kind')"
            :help="t('reports.builder.kind-help')"
            name="kind"
          >
            <USelect
              v-model="form.kind"
              :items="kindItems"
            />
          </UFormField>
          <UFormField
            :label="t('reports.builder.description')"
            name="description"
            class="sm:col-span-2"
          >
            <UTextarea
              :model-value="form.description ?? ''"
              :rows="2"
              autoresize
              @update:model-value="v => form.description = String(v)"
            />
          </UFormField>
        </div>
      </PageSection>

      <PageSection
        :title="t('reports.builder.columns')"
        :description="t('reports.builder.columns-help')"
      >
        <template #actions>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            :label="t('reports.builder.add-figure')"
            :disabled="people && form.columns.length >= PEOPLE_MAX"
            @click="addFigure"
          />
          <UButton
            v-if="!people"
            color="neutral"
            variant="outline"
            icon="i-lucide-sigma"
            :label="t('reports.builder.add-formula')"
            :disabled="!form.columns.length"
            @click="addFormula"
          />
        </template>
        <ReportColumnList
          :names="form.columns.map(columnName)"
          :lines="form.columns.map(columnLine)"
          :keys="keys"
          :errors="columnErrors"
          :items="rowItems"
          @reorder="onReorder"
          @handle-key="onHandleKey"
        />
      </PageSection>

      <PageSection :title="t('reports.builder.layout')">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            :label="t('reports.builder.rows-by')"
            name="rowsBy"
          >
            <USelect
              v-model="rowsBy"
              :items="rowKeys"
            />
          </UFormField>
          <UFormField
            v-if="!people"
            :label="t('reports.builder.across-by')"
            :help="t('reports.builder.across-by-help')"
            name="acrossBy"
          >
            <USelect
              v-model="acrossBy"
              :items="acrossKeys"
            />
          </UFormField>
          <UFormField
            v-if="!people"
            :label="t('reports.builder.filter')"
            name="filter"
          >
            <USelect
              v-model="filterKey"
              :items="filterKeys"
            />
          </UFormField>
          <UFormField
            v-if="!people && form.filter && filterIsRecord"
            :label="nameOf(form.filter.key)"
            name="filter.values"
          >
            <FieldRecord
              v-model="filterRecord"
              :record="`core.${form.filter.key}`"
            />
          </UFormField>
          <UFormField
            v-else-if="!people && form.filter"
            :label="t('reports.builder.filter-values', { key: nameOf(form.filter.key).toLowerCase() })"
            name="filter.values"
          >
            <USelectMenu
              v-model="form.filter.values"
              :items="filterValues?.values ?? []"
              value-key="value"
              multiple
            />
          </UFormField>
          <UFormField
            v-if="!people"
            :label="t('reports.builder.chart')"
            name="chart"
          >
            <USelect
              v-model="chart"
              :items="chartItems"
            />
          </UFormField>
        </div>
      </PageSection>

      <ReportQuestionFields
        v-model:scope-kind="form.scopeKind"
        v-model:scope-id="form.scopeId"
        v-model:period-rule="form.periodRule"
        v-model:share-role="form.shareRole"
        :people="people"
        :roles="roles?.roles ?? []"
      />

      <div class="flex gap-2">
        <UButton
          type="submit"
          :loading="saving"
          :label="t(id ? 'reports.builder.save-changes' : 'reports.builder.save')"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :to="id ? `/console/reports/${id}` : '/console/reports'"
          :label="t('reports.builder.cancel')"
        />
      </div>
    </UForm>

    <ReportColumnDialog
      v-model="editing"
      :figure-items="figureItems"
      :earlier="earlier"
      @keep="keepColumn"
    />
  </div>
</template>
