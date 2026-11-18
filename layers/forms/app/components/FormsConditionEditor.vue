<!-- A condition built by choosing (FB-204): what to look at, how to compare it, and with what. The
     first picker offers only the questions that come earlier, and the second only the comparisons
     that suit the first. Groups nest as far as the site's limit allows. -->
<script setup lang="ts">
import { kindOfQuestion, operatorsFor, type Comparison, type Condition, type Operand, type Operator, type Question } from '../../shared/engine'

const props = withDefaults(defineProps<{
  /** The questions this condition may read. */
  questions: Question[]
  depth?: number
}>(), { depth: 1 })
const model = defineModel<Condition | undefined>()
const { t } = useT()
const MOST_DEPTH = 3 // not-policy: the default of forms.limits.condition-depth; the server holds the real limit

type Mode = 'all' | 'any' | 'none'
const mode = computed<Mode>(() => !model.value ? 'all' : 'any' in model.value ? 'any' : 'none' in model.value ? 'none' : 'all')
const parts = computed<Condition[]>(() => {
  const c = model.value
  if (!c) return []
  if ('all' in c) return c.all
  if ('any' in c) return c.any
  if ('none' in c) return c.none
  return [c]
})
const isGroup = (c: Condition) => 'all' in c || 'any' in c || 'none' in c
function write(next: Condition[], as: Mode = mode.value) {
  model.value = !next.length && props.depth === 1 ? undefined : { [as]: next } as Condition
}
const setPart = (i: number, c: Condition | undefined) => write(c ? parts.value.map((x, j) => j === i ? c : x) : parts.value.filter((_, j) => j !== i))

const byId = computed(() => new Map(props.questions.map(q => [q.id, q])))
const subjects = computed(() => props.questions.map(q => ({ value: q.id, label: formsQuestionName(q) })))
const subjectOf = (c: Comparison) => 'answer' in c.left ? byId.value.get(c.left.answer) : undefined
const operators = (c: Comparison) => {
  const q = subjectOf(c)
  return (q ? operatorsFor(kindOfQuestion(q)) : [c.op]).map(op => ({ value: op, label: t(`forms.operators.${op}`) }))
}
const MANY: Operator[] = ['any-of', 'includes-any', 'includes-all']
const NOTHING: Operator[] = ['answered', 'empty']

function blank(): Comparison {
  const q = props.questions.at(-1)
  return fresh(q, q ? operatorsFor(kindOfQuestion(q))[0]! : 'answered')
}
/** A comparison of this question with a right-hand side that suits it, empty. */
function fresh(q: Question | undefined, op: Operator): Comparison {
  const left: Operand = { answer: q?.id ?? '' }
  if (!q || NOTHING.includes(op)) return { left, op }
  if (MANY.includes(op)) return { left, op, right: [] }
  const kind = kindOfQuestion(q)
  if (op === 'between') return { left, op, right: [{ value: 0 }, { value: 0 }] }
  if (op === 'count-at-least') return { left, op, right: { value: 1 } }
  if (op === 'within-days') return { left, op, right: { today: true }, days: 7 } // not-policy: a starting value the author changes
  if (kind === 'number') return { left, op, right: { value: 0 } }
  if (kind === 'date') return { left, op, right: { today: true } }
  if (q.type === 'yesno' || q.type === 'consent') return { left, op, right: { value: true } }
  if (kind === 'single' || kind === 'multiple') return { left, op, right: { option: q.options?.[0]?.id ?? '' } }
  return { left, op, right: { value: '' } }
}
const options = (q: Question | undefined) => [...(q?.options ?? []).map(o => ({ value: o.id, label: o.label || o.id })), ...(q?.allowOther ? [{ value: 'other', label: t('forms.screens.options.other') }] : [])]
const truth = computed(() => [{ value: true, label: t('forms.screens.logic.yes') }, { value: false, label: t('forms.screens.logic.no') }])

type RightKind = 'none' | 'option' | 'options' | 'truth' | 'number' | 'between' | 'date' | 'text'
function rightKind(c: Comparison): RightKind {
  const q = subjectOf(c)
  if (!q || NOTHING.includes(c.op)) return 'none'
  if (MANY.includes(c.op)) return 'options'
  if (c.op === 'between') return 'between'
  if (c.op === 'count-at-least') return 'number'
  const kind = kindOfQuestion(q)
  if (kind === 'number') return 'number'
  if (kind === 'date') return 'date'
  if (q.type === 'yesno' || q.type === 'consent') return 'truth'
  if (kind === 'single' || kind === 'multiple') return q.type === 'record' ? 'none' : 'option'
  return 'text'
}
const one = (c: Comparison) => (Array.isArray(c.right) ? undefined : c.right) as Record<string, any> | undefined
const many = (c: Comparison) => (Array.isArray(c.right) ? c.right : []) as Record<string, any>[]
const isToday = (c: Comparison) => !!one(c) && 'today' in one(c)!
</script>

<template>
  <div class="space-y-2">
    <div
      v-if="parts.length > 1 || depth > 1"
      class="flex items-center gap-2"
    >
      <USelect
        :model-value="mode"
        :items="(['all', 'any', 'none'] as const).map(m => ({ value: m, label: t(`forms.screens.logic.mode-${m}`) }))"
        size="sm"
        :aria-label="t('forms.screens.logic.mode')"
        @update:model-value="write(parts, $event as Mode)"
      />
    </div>
    <div
      v-for="(part, i) in parts"
      :key="i"
      class="rounded-md border border-default p-2"
      :class="isGroup(part) ? 'bg-elevated/40' : ''"
    >
      <div
        v-if="isGroup(part)"
        class="flex items-start gap-2"
      >
        <FormsConditionEditor
          class="min-w-0 flex-1"
          :model-value="part"
          :questions="questions"
          :depth="depth + 1"
          @update:model-value="setPart(i, $event)"
        />
        <IconButton
          icon="i-lucide-x"
          :label="t('forms.screens.logic.remove-group')"
          @click="setPart(i, undefined)"
        />
      </div>
      <div
        v-else
        class="flex flex-wrap items-center gap-2"
      >
        <USelectMenu
          class="min-w-36 flex-1"
          :model-value="(part as Comparison).left && 'answer' in (part as Comparison).left ? ((part as Comparison).left as { answer: string }).answer : undefined"
          :items="subjects"
          value-key="value"
          size="sm"
          :placeholder="t('forms.screens.logic.choose-question')"
          :aria-label="t('forms.screens.logic.question')"
          @update:model-value="setPart(i, fresh(byId.get($event as string), operatorsFor(kindOfQuestion(byId.get($event as string)!))[0]!))"
        />
        <USelect
          class="min-w-32"
          :model-value="(part as Comparison).op"
          :items="operators(part as Comparison)"
          size="sm"
          :aria-label="t('forms.screens.logic.comparison')"
          @update:model-value="setPart(i, fresh(subjectOf(part as Comparison), $event as Operator))"
        />
        <template v-if="rightKind(part as Comparison) === 'option'">
          <USelect
            class="min-w-32 flex-1"
            :model-value="one(part as Comparison)?.option"
            :items="options(subjectOf(part as Comparison))"
            size="sm"
            :aria-label="t('forms.screens.logic.value')"
            @update:model-value="setPart(i, { ...(part as Comparison), right: { option: $event as string } })"
          />
        </template>
        <template v-else-if="rightKind(part as Comparison) === 'options'">
          <USelectMenu
            class="min-w-32 flex-1"
            multiple
            :model-value="many(part as Comparison).map(o => o.option)"
            :items="options(subjectOf(part as Comparison))"
            value-key="value"
            size="sm"
            :aria-label="t('forms.screens.logic.value')"
            @update:model-value="setPart(i, { ...(part as Comparison), right: ($event as string[]).map(option => ({ option })) })"
          />
        </template>
        <template v-else-if="rightKind(part as Comparison) === 'truth'">
          <USelect
            class="min-w-24"
            :model-value="one(part as Comparison)?.value"
            :items="truth"
            size="sm"
            :aria-label="t('forms.screens.logic.value')"
            @update:model-value="setPart(i, { ...(part as Comparison), right: { value: $event as boolean } })"
          />
        </template>
        <template v-else-if="rightKind(part as Comparison) === 'number'">
          <UInputNumber
            class="w-28"
            :model-value="one(part as Comparison)?.value"
            size="sm"
            :aria-label="t('forms.screens.logic.value')"
            @update:model-value="setPart(i, { ...(part as Comparison), right: { value: $event ?? 0 } })"
          />
        </template>
        <template v-else-if="rightKind(part as Comparison) === 'between'">
          <UInputNumber
            v-for="n in [0, 1]"
            :key="n"
            class="w-28"
            :model-value="many(part as Comparison)[n]?.value"
            size="sm"
            :aria-label="t(n ? 'forms.screens.logic.to' : 'forms.screens.logic.from')"
            @update:model-value="setPart(i, { ...(part as Comparison), right: many(part as Comparison).map((o, k) => k === n ? { value: $event ?? 0 } : o) as Operand[] })"
          />
        </template>
        <template v-else-if="rightKind(part as Comparison) === 'date'">
          <UInputNumber
            v-if="(part as Comparison).op === 'within-days'"
            class="w-24"
            :model-value="(part as Comparison).days"
            :min="0"
            size="sm"
            :aria-label="t('forms.screens.logic.days')"
            @update:model-value="setPart(i, { ...(part as Comparison), days: $event ?? 0 })"
          />
          <USelect
            class="min-w-28"
            :model-value="isToday(part as Comparison) ? 'today' : 'date'"
            :items="[{ value: 'today', label: t('forms.screens.logic.today') }, { value: 'date', label: t('forms.screens.logic.a-date') }]"
            size="sm"
            :aria-label="t('forms.screens.logic.compare-with')"
            @update:model-value="setPart(i, { ...(part as Comparison), right: $event === 'today' ? { today: true } : { value: '' } })"
          />
          <FieldDate
            v-if="!isToday(part as Comparison)"
            :model-value="one(part as Comparison)?.value || null"
            :aria-label="t('forms.screens.logic.value')"
            @update:model-value="setPart(i, { ...(part as Comparison), right: { value: $event ?? '' } })"
          />
        </template>
        <template v-else-if="rightKind(part as Comparison) === 'text'">
          <UInput
            class="min-w-32 flex-1"
            :model-value="one(part as Comparison)?.value"
            size="sm"
            :aria-label="t('forms.screens.logic.value')"
            @update:model-value="setPart(i, { ...(part as Comparison), right: { value: String($event) } })"
          />
        </template>
        <IconButton
          icon="i-lucide-x"
          :label="t('forms.screens.logic.remove')"
          @click="setPart(i, undefined)"
        />
      </div>
    </div>
    <div class="flex flex-wrap gap-2">
      <UButton
        v-if="questions.length"
        :label="t('forms.screens.logic.add')"
        icon="i-lucide-plus"
        size="sm"
        color="neutral"
        variant="soft"
        @click="write([...parts, blank()])"
      />
      <UButton
        v-if="questions.length && parts.length && depth < MOST_DEPTH"
        :label="t('forms.screens.logic.add-group')"
        icon="i-lucide-brackets"
        size="sm"
        color="neutral"
        variant="ghost"
        @click="write([...parts, { any: [blank()] }])"
      />
      <p
        v-if="!questions.length"
        class="text-sm text-muted"
      >
        {{ t('forms.screens.logic.no-earlier') }}
      </p>
    </div>
  </div>
</template>
