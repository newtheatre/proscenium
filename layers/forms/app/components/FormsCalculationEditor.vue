<!-- A calculation's details, beside the canvas (FB-104): what it is called, how its value reads, the
     page it is shown on, and its formula, built from rows like the rest of the builder. Each row is
     a term (an answer, a total over a repeating group, a count of entries, another calculation or a
     number) and the sign that joins it to the row before. A formula the rows cannot show, written as
     JSON, is kept as it is until the author starts it again. -->
<script setup lang="ts">
import { calculationInputs, changeCalculation, dependents, labelCalculation, removeCalculation } from '../../shared/builder/edit'
import { OPERATIONS, expressionOf, formulaOf, type Formula, type FormulaRow, type Operation, type Term } from '../../shared/builder/formula'
import type { Calculation, CalculationType } from '../../shared/engine'

const props = defineProps<{ calculation: Calculation }>()
const { t } = useT()
const builder = useBuilder()
const { confirm } = useConfirm()
const { figure } = useFormsFigures()
const def = computed(() => builder.definition.value)
const id = computed(() => props.calculation.id)

const edit = (fn: (c: Calculation) => void, field?: string) => builder.apply(changeCalculation(def.value, id.value, fn), field ? `${id.value}:${field}` : undefined)
const text = (v: unknown) => String(v ?? '')

// ---- name, format and page ----
const NOWHERE = ':nowhere' // a page id cannot hold a colon
const pages = computed(() => [
  { value: NOWHERE, label: t('forms.screens.calculations.nowhere') },
  ...def.value.pages.map((p, i) => ({ value: p.id, label: p.title.trim() || t('forms.screens.builder.page-n', { n: i + 1 }) })),
])
const OFFERED: CalculationType[] = ['number', 'money', 'percent']
const formats = computed(() => [...OFFERED, ...(OFFERED.includes(props.calculation.type) ? [] : [props.calculation.type])].map(type => ({ value: type, label: t(`forms.screens.calculations.format-${type}`) })))
const setLabel = (label: string) => builder.apply(labelCalculation(def.value, id.value, label, builder.published.value.size === 0), `${id.value}:label`)
const setPage = (page: string) => edit((c) => {
  if (page === NOWHERE) Reflect.deleteProperty(c, 'page')
  else c.page = page
})

// ---- the formula ----
const formula = computed(() => formulaOf(props.calculation.expression))
const inputs = computed(() => calculationInputs(def.value, id.value))
const write = (next: Formula, field?: string) => edit((c) => { c.expression = expressionOf(next) }, field)
const setRow = (i: number, row: FormulaRow, field?: string) => formula.value && write({ ...formula.value, rows: formula.value.rows.map((r, j) => j === i ? row : r) }, field)

type Kind = 'answer' | 'sum' | 'count' | 'calculation' | 'value'
const kindOf = (term: Term): Kind => 'answer' in term ? 'answer' : 'calculation' in term ? 'calculation' : 'value' in term ? 'value' : term.fn
const kinds = computed(() => ([
  ['answer', inputs.value.questions.length > 0],
  ['sum', inputs.value.groups.some(g => g.numbers.length)],
  ['count', inputs.value.groups.length > 0],
  ['calculation', inputs.value.calculations.length > 0],
  ['value', true],
] as const).filter(([, offered]) => offered).map(([kind]) => ({ value: kind, label: t(`forms.screens.calculations.term-${kind}`) })))
/** A term of this kind that reads the first thing it can. */
function termOf(kind: Kind): Term {
  const { questions, groups, calculations } = inputs.value
  if (kind === 'answer' && questions[0]) return { answer: questions[0].id }
  const totalled = groups.find(g => g.numbers.length)
  if (kind === 'sum' && totalled) return { fn: 'sum', group: totalled.group.id, of: totalled.numbers[0]!.id }
  if (kind === 'count' && groups[0]) return { fn: 'count', group: groups[0].group.id }
  if (kind === 'calculation' && calculations[0]) return { calculation: calculations[0].id }
  return { value: kind === 'value' ? 1 : 0 }
}
const questions = computed(() => inputs.value.questions.map(q => ({ value: q.id, label: formsQuestionName(q) })))
const totals = computed(() => inputs.value.groups.flatMap(g => g.numbers.map(q => ({ value: `${g.group.id}/${q.id}`, label: t('forms.screens.calculations.sentence-sum', { question: formsQuestionName(q), group: g.group.label.trim() || t('forms.screens.builder.untitled-group') }) }))))
const groups = computed(() => inputs.value.groups.map(g => ({ value: g.group.id, label: g.group.label.trim() || t('forms.screens.builder.untitled-group') })))
const others = computed(() => inputs.value.calculations.map(c => ({ value: c.id, label: c.label?.trim() || c.key })))
const signs = OPERATIONS.map(op => ({ value: op, label: `${FORMS_OPERATION_SIGNS[op]} ${t(`forms.screens.calculations.op-${op}`)}` }))
/** In a money calculation a number added or taken away is an amount of money; one multiplied or divided by is a plain number. */
const isAmount = (row: FormulaRow, i: number) => props.calculation.type === 'money' && (i === 0 || row.op === 'add' || row.op === 'subtract')

function addRow() {
  if (!formula.value) return
  write({ ...formula.value, rows: [...formula.value.rows, { op: 'add', term: termOf(kinds.value[0]!.value) }] })
}
function dropRow(i: number) {
  if (!formula.value || formula.value.rows.length < 2) return
  const rows = formula.value.rows.filter((_, j) => j !== i)
  write({ ...formula.value, rows: rows.map((r, j) => (j === 0 ? { term: r.term } : r)) })
}
const startAgain = () => write({ rows: [{ term: termOf(kinds.value[0]!.value) }], blankAsNothing: false })
const sentence = computed(() => formula.value ? formsFormulaSentence(formula.value, def.value, (v, i) => isAmount(formula.value!.rows[i]!, i) ? figure({ type: 'money' }, v) : String(v)) : '')

// ---- removing ----
async function remove() {
  const readers = dependents(def.value, id.value).length
  if (readers && !(await confirm({ verb: t('forms.screens.builder.remove'), thing: `"${props.calculation.label?.trim() || props.calculation.key}"`, consequence: t('forms.screens.calculations.remove-read', { count: readers }) }))) return
  builder.apply(removeCalculation(def.value, id.value))
}
</script>

<template>
  <div class="space-y-5">
    <UFormField
      :label="t('forms.screens.calculations.label')"
      :help="t('forms.screens.calculations.label-help')"
    >
      <UInput
        :model-value="calculation.label ?? ''"
        @update:model-value="setLabel(text($event))"
      />
    </UFormField>
    <div class="grid grid-cols-2 gap-3">
      <UFormField :label="t('forms.screens.calculations.format')">
        <USelect
          :model-value="calculation.type"
          :items="formats"
          @update:model-value="edit((c) => { c.type = $event as CalculationType })"
        />
      </UFormField>
      <UFormField :label="t('forms.screens.calculations.page')">
        <USelect
          :model-value="calculation.page ?? NOWHERE"
          :items="pages"
          @update:model-value="setPage($event as string)"
        />
      </UFormField>
    </div>
    <p class="text-sm text-muted">
      {{ t(calculation.page ? 'forms.screens.calculations.page-help' : 'forms.screens.calculations.nowhere-help') }}
    </p>

    <USeparator :label="t('forms.screens.calculations.formula')" />
    <template v-if="formula">
      <ol class="space-y-2">
        <li
          v-for="(row, i) in formula.rows"
          :key="i"
          class="space-y-2 rounded-md border border-default p-2"
          :data-formula-row="i"
        >
          <div class="flex items-center gap-2">
            <USelect
              v-if="i > 0"
              size="sm"
              class="w-32"
              :model-value="row.op ?? 'add'"
              :items="signs"
              :aria-label="t('forms.screens.calculations.op')"
              @update:model-value="setRow(i, { ...row, op: $event as Operation })"
            />
            <span
              v-else
              class="text-sm text-muted"
            >{{ t('forms.screens.calculations.start') }}</span>
            <USelect
              size="sm"
              class="min-w-0 flex-1"
              :model-value="kindOf(row.term)"
              :items="kinds"
              :aria-label="t('forms.screens.calculations.term')"
              @update:model-value="setRow(i, { ...row, term: termOf($event as Kind) })"
            />
            <IconButton
              icon="i-lucide-x"
              size="sm"
              :label="t('forms.screens.calculations.remove-row')"
              :disabled="formula.rows.length < 2"
              @click="dropRow(i)"
            />
          </div>
          <USelect
            v-if="'answer' in row.term"
            size="sm"
            :model-value="row.term.answer"
            :items="questions"
            :placeholder="t('forms.screens.calculations.choose')"
            :aria-label="t('forms.screens.calculations.term-answer')"
            @update:model-value="setRow(i, { ...row, term: { answer: $event as string } })"
          />
          <USelect
            v-else-if="'calculation' in row.term"
            size="sm"
            :model-value="row.term.calculation"
            :items="others"
            :placeholder="t('forms.screens.calculations.choose')"
            :aria-label="t('forms.screens.calculations.term-calculation')"
            @update:model-value="setRow(i, { ...row, term: { calculation: $event as string } })"
          />
          <template v-else-if="'value' in row.term">
            <FieldMoney
              v-if="isAmount(row, i)"
              size="sm"
              :model-value="row.term.value"
              :aria-label="t('forms.screens.calculations.term-value')"
              @update:model-value="setRow(i, { ...row, term: { value: $event ?? 0 } }, `row:${i}`)"
            />
            <UInputNumber
              v-else
              size="sm"
              :model-value="row.term.value"
              :step="0.01"
              :aria-label="t('forms.screens.calculations.term-value')"
              @update:model-value="setRow(i, { ...row, term: { value: $event ?? 0 } }, `row:${i}`)"
            />
          </template>
          <USelect
            v-else-if="row.term.fn === 'sum'"
            size="sm"
            :model-value="`${row.term.group}/${row.term.of}`"
            :items="totals"
            :placeholder="t('forms.screens.calculations.choose')"
            :aria-label="t('forms.screens.calculations.term-sum')"
            @update:model-value="setRow(i, { ...row, term: { fn: 'sum', group: String($event).split('/')[0]!, of: String($event).split('/')[1]! } })"
          />
          <USelect
            v-else
            size="sm"
            :model-value="row.term.group"
            :items="groups"
            :placeholder="t('forms.screens.calculations.choose')"
            :aria-label="t('forms.screens.calculations.term-count')"
            @update:model-value="setRow(i, { ...row, term: { fn: 'count', group: $event as string } })"
          />
        </li>
      </ol>
      <UButton
        :label="t('forms.screens.calculations.add-row')"
        icon="i-lucide-plus"
        size="sm"
        color="neutral"
        variant="soft"
        @click="addRow"
      />
      <USwitch
        :model-value="formula.blankAsNothing"
        :label="t('forms.screens.calculations.blank')"
        :description="t(formula.blankAsNothing ? 'forms.screens.calculations.blank-yes' : 'forms.screens.calculations.blank-no')"
        @update:model-value="write({ ...formula, blankAsNothing: $event })"
      />
      <div class="rounded-md bg-elevated/50 p-2 text-sm">
        <p
          class="font-medium"
          data-formula-sentence
        >
          = {{ sentence }}
        </p>
        <p
          v-if="formula.rows.some((r, i) => i > 0 && (r.op === 'multiply' || r.op === 'divide')) && formula.rows.some((r, i) => i > 0 && (r.op === 'add' || r.op === 'subtract'))"
          class="text-muted"
        >
          {{ t('forms.screens.calculations.order') }}
        </p>
      </div>
    </template>
    <UAlert
      v-else
      color="neutral"
      variant="subtle"
      icon="i-lucide-braces"
      :title="t('forms.screens.calculations.written')"
      :description="t('forms.screens.calculations.written-help')"
      :actions="[{ label: t('forms.screens.calculations.start-again'), color: 'neutral', variant: 'outline', onClick: startAgain }]"
    />
    <FormsProblemBadge :at="calculation.id" />

    <USeparator :label="t('forms.screens.details.data')" />
    <UFormField
      :label="t('forms.screens.details.key')"
      :help="t('forms.screens.calculations.key-help')"
    >
      <UInput
        :model-value="calculation.key"
        class="font-mono"
        @update:model-value="edit((c) => { c.key = text($event).toLowerCase().replace(/[^a-z\d_]/g, '_') }, 'key')"
      />
    </UFormField>
    <UButton
      :label="t('forms.screens.calculations.remove')"
      icon="i-lucide-trash-2"
      color="error"
      variant="soft"
      size="sm"
      @click="remove"
    />
  </div>
</template>
