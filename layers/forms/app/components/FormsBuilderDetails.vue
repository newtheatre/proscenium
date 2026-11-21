<!-- The details of whatever is selected, beside the canvas: a question's wording, set-up, logic and
     checks; a page's title and where it leads; a group's limits; a text block's words. -->
<script setup lang="ts">
import { CHOICE_TYPES, change, earlier, find, keyFrom } from '../../shared/builder/edit'
import { DATA_CLASSES, PATTERNS, QUESTION_TYPES, RULES_FOR, type Condition, type Content, type Ending, type Group, type Option, type Page, type Question, type QuestionType, type Route, type Rule, type RuleName } from '../../shared/engine'

const { t } = useT()
const builder = useBuilder()
const def = computed(() => builder.definition.value)
const found = computed(() => builder.selected.value ? find(def.value, builder.selected.value) : null)
const ending = computed(() => def.value.endings?.find(e => e.id === builder.selected.value))
const calculation = computed(() => def.value.calculations?.find(c => c.id === builder.selected.value))
const question = computed(() => found.value && found.value.kind !== 'page' && found.value.item.kind === 'question' ? found.value.item : null)
const group = computed(() => found.value?.kind === 'item' && found.value.item.kind === 'group' ? found.value.item : null)
const content = computed(() => found.value?.kind === 'item' && found.value.item.kind === 'content' ? found.value.item : null)
const page = computed(() => found.value?.kind === 'page' ? found.value.page : null)
const before = computed(() => builder.selected.value ? earlier(def.value, builder.selected.value) : [])
const published = computed(() => question.value ? builder.published.value.get(question.value.id) : undefined)

/** Edits the selected thing. `field` names the edit, so typing in one box is one undo step. */
function edit<T>(fn: (target: T) => void, field?: string) {
  const id = builder.selected.value
  if (id) builder.apply(change(def.value, id, fn), field ? `${id}:${field}` : undefined)
}
const setQ = <K extends keyof Question>(key: K, value: Question[K] | undefined, typing = false) => edit<Question>((q) => {
  if (value === undefined) Reflect.deleteProperty(q, key)
  else q[key] = value
}, typing ? key : undefined)

// The export name follows the label until the question is published or the author writes their own.
function setLabel(label: string) {
  edit<Question>((q) => {
    const follows = !published.value && q.key === keyFrom(def.value, q.label || q.type.replace(/\W+/g, '_'), q.id)
    q.label = label
    if (follows) q.key = keyFrom(def.value, label || q.type.replace(/\W+/g, '_'), q.id)
  }, 'label')
}
function setType(type: QuestionType) {
  edit<Question>((q) => {
    q.type = type
    if (CHOICE_TYPES.includes(type)) q.options ??= [{ id: 'o1', label: '' }, { id: 'o2', label: '' }]
    else Reflect.deleteProperty(q, 'options')
    if (!['choice.single', 'choice.multiple', 'choice.dropdown'].includes(type)) Reflect.deleteProperty(q, 'allowOther')
    if (!['choice.dropdown', 'record'].includes(type)) Reflect.deleteProperty(q, 'multiple')
    if (type !== 'record') {
      Reflect.deleteProperty(q, 'source')
      Reflect.deleteProperty(q, 'peopleInvolved')
      Reflect.deleteProperty(q, 'openSearch')
    }
    if (type === 'rating') q.scale = { max: q.scale?.max ?? 5 } // not-policy: five stars to start from
    else if (type === 'scale') q.scale = { min: q.scale?.min ?? 1, max: q.scale?.max ?? 5 } // not-policy: one to five to start from
    else Reflect.deleteProperty(q, 'scale')
    q.validation = q.validation?.filter(r => RULES_FOR[r.rule].includes(type))
    if (!q.validation?.length) Reflect.deleteProperty(q, 'validation')
  })
}

const types = computed(() => QUESTION_TYPES.map(type => ({ value: type, label: t(`forms.types.${type}.label`), icon: formsQuestionIcon(type) })))
// A published question's answers may be classed as more sensitive, never less.
const classes = computed(() => DATA_CLASSES.map((c, i) => ({ value: c, label: t(`forms.classes.${c}.label`), disabled: !!published.value && i < DATA_CLASSES.indexOf(published.value.dataClass as typeof c) })))
const requiredMode = computed(() => question.value?.required === true ? 'always' : question.value?.required ? 'when' : 'never')
function setRequired(mode: string) {
  if (mode === 'never') setQ('required', undefined)
  else if (mode === 'always') setQ('required', true)
  else setQ('required', { all: [] })
}

// ---- checks on the answer ----
const RULES_OFFERED: RuleName[] = ['minLength', 'maxLength', 'min', 'max', 'whole', 'minDate', 'maxDate', 'minChosen', 'maxChosen', 'pattern', 'fileTypes', 'maxFileSize', 'maxFiles']
const rules = computed(() => question.value?.validation ?? [])
const rulesLeft = computed(() => RULES_OFFERED.filter(r => question.value && RULES_FOR[r].includes(question.value.type) && !rules.value.some(x => x.rule === r)).map(r => ({ label: t(`forms.rules.${r}`), onSelect: () => addRule(r) })))
const MEGABYTE = 1024 * 1024 // not-policy: unit of size; a file's largest size is kept in bytes and set in megabytes
// The kinds of file the platform can check: documents and images, each a rule value the engine reads.
const FILE_KINDS = computed(() => [{ value: '.pdf', label: t('forms.screens.details.file-pdf') }, { value: 'image/*', label: t('forms.screens.details.file-images') }])
const starting = (rule: RuleName): Rule['value'] => rule === 'whole' ? undefined : rule === 'pattern' ? 'letters' : rule === 'minDate' || rule === 'maxDate' ? { today: 0 } : rule === 'fileTypes' ? ['.pdf', 'image/*'] : rule === 'maxFileSize' ? 5 * MEGABYTE : 1 // not-policy: a starting size an author changes
function addRule(rule: RuleName) {
  const value = starting(rule)
  setQ('validation', [...rules.value, value === undefined ? { rule } : { rule, value }])
}
const setRule = (i: number, patch: Partial<Rule>, typing?: string) => edit<Question>((q) => {
  q.validation = q.validation!.map((r, j) => j === i ? { ...r, ...patch } : r)
  if (patch.message === '') Reflect.deleteProperty(q.validation[i]!, 'message')
}, typing)
const dropRule = (i: number) => setQ('validation', rules.value.length > 1 ? rules.value.filter((_, j) => j !== i) : undefined)
const patterns = computed(() => Object.keys(PATTERNS).map(p => ({ value: p, label: t(`forms.patterns.${p}`) })))

// ---- a page's routes and the endings they may lead to ----
const laterPages = computed(() => found.value?.kind === 'page' ? def.value.pages.slice(found.value.pageIndex + 1) : [])
const targets = computed(() => [
  ...laterPages.value.map((p, i) => ({ value: `page:${p.id}`, label: p.title.trim() || t('forms.screens.builder.page-n', { n: (found.value?.pageIndex ?? 0) + i + 2 }) })),
  ...(def.value.endings ?? []).map(e => ({ value: `ending:${e.id}`, label: t('forms.screens.routes.ending', { title: e.title.trim() || t('forms.screens.builder.untitled-ending') }) })),
])
const routeQuestions = computed(() => page.value ? [...before.value, ...page.value.items.flatMap(i => i.kind === 'question' ? [i] : i.kind === 'row' ? i.items : [])] : [])
const targetOf = (r: Route) => 'page' in r.to ? `page:${r.to.page}` : `ending:${r.to.ending}`
const setRoutes = (routes: Route[]) => edit<Page>((p) => {
  if (routes.length) p.routes = routes
  else Reflect.deleteProperty(p, 'routes')
})
function addRoute() {
  const first = targets.value[0]
  if (first && page.value) setRoutes([...(page.value.routes ?? []), { when: { all: [] }, to: toTarget(first.value) }])
}
const toTarget = (value: string): Route['to'] => value.startsWith('page:') ? { page: value.slice(5) } : { ending: value.slice(7) } // not-policy: the lengths of "page:" and "ending:"
const setRoute = (i: number, patch: Partial<Route>) => setRoutes((page.value?.routes ?? []).map((r, j) => j === i ? { ...r, ...patch } : r))

function editEnding(fn: (e: Ending) => void, field: string) {
  const id = builder.selected.value
  const next = JSON.parse(JSON.stringify(def.value)) as typeof def.value
  const target = next.endings?.find(e => e.id === id)
  if (!target) return
  fn(target)
  builder.apply(next, `${id}:${field}`)
}
const sources = computed(() => builder.sources.value.map(s => ({ value: s.key, label: t(s.label) })))
/** Choosing people as the source makes the answers personal, unless the author has already said they are more than that. */
function setSource(key: string) {
  edit<Question>((q) => {
    q.source = key
    const people = builder.sources.value.find(s => s.key === key)?.people
    if (people && (q.dataClass === 'public' || q.dataClass === 'internal')) q.dataClass = 'personal'
    if (!people) Reflect.deleteProperty(q, 'peopleInvolved')
  })
}
const ofPeople = computed(() => builder.sources.value.find(s => s.key === question.value?.source)?.people ?? false)
const condition = (c: Condition | undefined) => c ? formsConditionSentence(c, def.value) : ''
const text = (v: unknown) => String(v ?? '')
const TIPS = [{ key: 'tip-drag', icon: 'i-lucide-grip-vertical' }, { key: 'tip-save', icon: 'i-lucide-cloud-check' }]
</script>

<template>
  <div
    class="space-y-5"
    data-forms-details
  >
    <div
      v-if="!found && !ending && !calculation"
      class="space-y-3 text-sm text-muted"
    >
      <p>{{ t('forms.screens.details.nothing') }}</p>
      <p
        v-for="tip in TIPS"
        :key="tip.key"
        class="flex items-start gap-2"
      >
        <UIcon
          :name="tip.icon"
          class="mt-0.5 shrink-0"
        />
        <span class="text-pretty">{{ t(`forms.screens.details.${tip.key}`) }}</span>
      </p>
    </div>

    <!-- A question -->
    <template v-if="question">
      <UFormField :label="t('forms.screens.details.label')">
        <UTextarea
          :model-value="question.label"
          :rows="1"
          autoresize

          @update:model-value="setLabel(text($event))"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.details.help')"
        :hint="t('forms.screens.details.optional')"
      >
        <UTextarea
          :model-value="question.help ?? ''"
          :rows="1"
          autoresize

          @update:model-value="setQ('help', text($event) || undefined, true)"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.details.type')"
        :help="published ? t('forms.screens.details.type-fixed') : undefined"
      >
        <USelectMenu
          :model-value="question.type"
          :items="types"
          value-key="value"
          :disabled="!!published"

          @update:model-value="setType($event as QuestionType)"
        />
      </UFormField>

      <UFormField
        v-if="CHOICE_TYPES.includes(question.type)"
        :label="t('forms.screens.options.title')"
      >
        <FormsOptionsEditor
          :question="question"
          @change="(options: Option[], merge?: string) => edit<Question>((q) => { q.options = options }, merge)"
        />
        <USwitch
          v-if="['choice.single', 'choice.multiple', 'choice.dropdown'].includes(question.type)"
          class="mt-3"
          :model-value="!!question.allowOther"
          :label="t('forms.screens.options.allow-other')"
          @update:model-value="setQ('allowOther', $event || undefined)"
        />
      </UFormField>
      <USwitch
        v-if="['choice.dropdown', 'record'].includes(question.type)"
        :model-value="!!question.multiple"
        :label="t('forms.screens.details.multiple')"
        @update:model-value="setQ('multiple', $event || undefined)"
      />
      <UFormField
        v-if="question.type === 'record'"
        :label="t('forms.screens.details.source')"
        :help="t('forms.screens.details.source-help')"
      >
        <USelect
          :model-value="question.source"
          :items="sources"
          :placeholder="t('forms.screens.details.source-choose')"

          @update:model-value="setSource($event as string)"
        />
      </UFormField>
      <USwitch
        v-if="question.type === 'record' && ofPeople"
        :model-value="!!question.peopleInvolved"
        :label="t('forms.screens.details.people-involved')"
        :description="t('forms.screens.details.people-involved-help')"
        @update:model-value="setQ('peopleInvolved', $event || undefined)"
      />
      <USwitch
        v-if="question.type === 'record' && question.source"
        :model-value="!!question.openSearch"
        :label="t('forms.screens.details.open-search')"
        :description="t('forms.screens.details.open-search-help')"
        @update:model-value="setQ('openSearch', $event || undefined)"
      />
      <div
        v-if="question.type === 'rating' || question.type === 'scale'"
        class="grid grid-cols-2 gap-3"
      >
        <UFormField
          v-if="question.type === 'scale'"
          :label="t('forms.screens.details.scale-min')"
        >
          <UInputNumber
            :model-value="question.scale?.min ?? 0"
            @update:model-value="setQ('scale', { ...question.scale!, min: $event ?? 0 }, true)"
          />
        </UFormField>
        <UFormField :label="t(question.type === 'rating' ? 'forms.screens.details.rating-max' : 'forms.screens.details.scale-max')">
          <UInputNumber
            :model-value="question.scale?.max ?? 5"
            :min="1"
            @update:model-value="setQ('scale', { ...question.scale, max: $event ?? 1 }, true)"
          />
        </UFormField>
        <template v-if="question.type === 'scale'">
          <UFormField :label="t('forms.screens.details.scale-min-label')">
            <UInput
              :model-value="question.scale?.minLabel ?? ''"
              @update:model-value="setQ('scale', { ...question.scale!, minLabel: text($event) || undefined }, true)"
            />
          </UFormField>
          <UFormField :label="t('forms.screens.details.scale-max-label')">
            <UInput
              :model-value="question.scale?.maxLabel ?? ''"
              @update:model-value="setQ('scale', { ...question.scale!, maxLabel: text($event) || undefined }, true)"
            />
          </UFormField>
        </template>
      </div>

      <USeparator :label="t('forms.screens.details.logic')" />
      <UFormField :label="t('forms.screens.details.required')">
        <USelect
          :model-value="requiredMode"
          :items="(['never', 'always', 'when'] as const).map(m => ({ value: m, label: t(`forms.screens.details.required-${m}`) }))"

          @update:model-value="setRequired($event as string)"
        />
        <FormsConditionEditor
          v-if="requiredMode === 'when'"
          class="mt-2"
          :model-value="question.required as Condition"
          :questions="before"
          @update:model-value="setQ('required', $event ?? { all: [] })"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.details.shown-when')"
        :help="question.visibleWhen ? condition(question.visibleWhen) : t('forms.screens.details.always-shown')"
      >
        <FormsConditionEditor
          :model-value="question.visibleWhen"
          :questions="before"
          @update:model-value="setQ('visibleWhen', $event)"
        />
      </UFormField>

      <USeparator :label="t('forms.screens.details.checks')" />
      <div
        v-for="(rule, i) in rules"
        :key="rule.rule"
        class="space-y-2 rounded-md border border-default p-2"
      >
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 text-sm font-medium">{{ t(`forms.rules.${rule.rule}`) }}</span>
          <UCheckboxGroup
            v-if="rule.rule === 'fileTypes'"
            orientation="horizontal"
            size="sm"
            :model-value="Array.isArray(rule.value) ? rule.value as string[] : []"
            :items="FILE_KINDS"
            :aria-label="t('forms.rules.fileTypes')"
            @update:model-value="setRule(i, { value: $event as string[] })"
          />
          <UFieldGroup
            v-else-if="rule.rule === 'maxFileSize'"
            size="sm"
          >
            <UInputNumber
              class="w-24"
              :min="1"
              :model-value="Math.max(1, Math.round((rule.value as number) / MEGABYTE))"
              :aria-label="t('forms.rules.maxFileSize')"
              @update:model-value="setRule(i, { value: ($event ?? 1) * MEGABYTE }, `rule:${rule.rule}`)"
            />
            <UBadge
              color="neutral"
              variant="outline"
              :label="t('forms.screens.details.megabytes')"
            />
          </UFieldGroup>
          <UInputNumber
            v-else-if="typeof rule.value === 'number'"
            class="w-28"
            size="sm"
            :model-value="rule.value"
            :aria-label="t(`forms.rules.${rule.rule}`)"
            @update:model-value="setRule(i, { value: $event ?? 0 }, `rule:${rule.rule}`)"
          />
          <USelect
            v-else-if="rule.rule === 'pattern'"
            size="sm"
            :model-value="rule.value as string"
            :items="patterns"
            :aria-label="t(`forms.rules.${rule.rule}`)"
            @update:model-value="setRule(i, { value: $event as string })"
          />
          <template v-else-if="rule.rule === 'minDate' || rule.rule === 'maxDate'">
            <USelect
              size="sm"
              :model-value="typeof rule.value === 'string' ? 'date' : 'today'"
              :items="[{ value: 'today', label: t('forms.screens.details.days-from-today') }, { value: 'date', label: t('forms.screens.logic.a-date') }]"
              :aria-label="t('forms.screens.logic.compare-with')"
              @update:model-value="setRule(i, { value: $event === 'today' ? { today: 0 } : '' })"
            />
            <FieldDate
              v-if="typeof rule.value === 'string'"
              :model-value="rule.value"
              @update:model-value="setRule(i, { value: $event ?? '' })"
            />
            <UInputNumber
              v-else
              class="w-24"
              size="sm"
              :model-value="(rule.value as { today: number }).today"
              :aria-label="t('forms.screens.details.days-from-today')"
              @update:model-value="setRule(i, { value: { today: $event ?? 0 } }, `rule:${rule.rule}`)"
            />
          </template>
          <IconButton
            icon="i-lucide-x"
            size="sm"
            :label="t('forms.screens.details.remove-check')"
            @click="dropRule(i)"
          />
        </div>
        <UInput
          size="sm"

          :model-value="rule.message ?? ''"
          :placeholder="t('forms.screens.details.check-message')"
          :aria-label="t('forms.screens.details.check-message')"
          @update:model-value="setRule(i, { message: text($event) }, `rule-message:${rule.rule}`)"
        />
      </div>
      <UDropdownMenu
        v-if="rulesLeft.length"
        :items="rulesLeft"
      >
        <UButton
          :label="t('forms.screens.details.add-check')"
          icon="i-lucide-plus"
          size="sm"
          color="neutral"
          variant="soft"
        />
      </UDropdownMenu>
      <p
        v-else-if="!rules.length"
        class="text-sm text-muted"
      >
        {{ t('forms.screens.details.no-checks') }}
      </p>

      <USeparator :label="t('forms.screens.details.data')" />
      <UFormField
        :label="t('forms.screens.details.key')"
        :help="t('forms.screens.details.key-help')"
      >
        <UInput
          :model-value="question.key"
          class="font-mono"
          @update:model-value="setQ('key', text($event).toLowerCase().replace(/[^a-z\d_]/g, '_'), true)"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.details.class')"
        :help="t(`forms.classes.${question.dataClass}.help`)"
      >
        <USelect
          :model-value="question.dataClass"
          :items="classes"
          @update:model-value="setQ('dataClass', $event as Question['dataClass'])"
        />
      </UFormField>
    </template>

    <!-- A repeating group -->
    <template v-else-if="group">
      <UFormField :label="t('forms.screens.details.group-label')">
        <UInput
          :model-value="group.label"
          @update:model-value="edit<Group>((g) => { g.label = text($event) }, 'label')"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.details.help')"
        :hint="t('forms.screens.details.optional')"
      >
        <UInput
          :model-value="group.help ?? ''"
          @update:model-value="edit<Group>((g) => { g.help = text($event) || undefined }, 'help')"
        />
      </UFormField>
      <div class="grid grid-cols-2 gap-3">
        <UFormField :label="t('forms.screens.details.group-min')">
          <UInputNumber
            :model-value="group.min ?? 0"
            :min="0"
            @update:model-value="edit<Group>((g) => { g.min = $event ?? 0 }, 'min')"
          />
        </UFormField>
        <UFormField
          :label="t('forms.screens.details.group-max')"
          :hint="t('forms.screens.details.optional')"
        >
          <UInputNumber
            :model-value="group.max ?? null"
            :min="1"
            @update:model-value="edit<Group>((g) => { g.max = $event ?? undefined }, 'max')"
          />
        </UFormField>
      </div>
      <UFormField
        :label="t('forms.screens.details.shown-when')"
        :help="group.visibleWhen ? condition(group.visibleWhen) : t('forms.screens.details.always-shown')"
      >
        <FormsConditionEditor
          :model-value="group.visibleWhen"
          :questions="before"
          @update:model-value="edit<Group>((g) => { g.visibleWhen = $event })"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.details.key')"
        :help="t('forms.screens.details.key-help')"
      >
        <UInput
          :model-value="group.key"
          class="font-mono"
          @update:model-value="edit<Group>((g) => { g.key = text($event).toLowerCase().replace(/[^a-z\d_]/g, '_') }, 'key')"
        />
      </UFormField>
    </template>

    <!-- A block of text -->
    <template v-else-if="content">
      <UFormField
        :label="t('forms.screens.details.content')"
        :help="t('forms.screens.details.content-help')"
      >
        <UTextarea
          :model-value="content.text"
          :rows="5"
          autoresize

          @update:model-value="edit<Content>((c) => { c.text = text($event) }, 'text')"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.details.shown-when')"
        :help="content.visibleWhen ? condition(content.visibleWhen) : t('forms.screens.details.always-shown')"
      >
        <FormsConditionEditor
          :model-value="content.visibleWhen"
          :questions="before"
          @update:model-value="edit<Content>((c) => { c.visibleWhen = $event })"
        />
      </UFormField>
    </template>

    <!-- A page -->
    <template v-else-if="page">
      <UFormField :label="t('forms.screens.details.page-title')">
        <UInput
          :model-value="page.title"
          @update:model-value="edit<Page>((p) => { p.title = text($event) }, 'title')"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.details.page-help')"
        :hint="t('forms.screens.details.optional')"
      >
        <UTextarea
          :model-value="page.help ?? ''"
          :rows="2"
          autoresize

          @update:model-value="edit<Page>((p) => { p.help = text($event) || undefined }, 'help')"
        />
      </UFormField>
      <UFormField
        v-if="found?.kind === 'page' && found.pageIndex > 0"
        :label="t('forms.screens.details.shown-when')"
        :help="page.visibleWhen ? condition(page.visibleWhen) : t('forms.screens.details.always-shown')"
      >
        <FormsConditionEditor
          :model-value="page.visibleWhen"
          :questions="before"
          @update:model-value="edit<Page>((p) => { p.visibleWhen = $event })"
        />
      </UFormField>
      <USeparator :label="t('forms.screens.routes.title')" />
      <p class="text-sm text-muted">
        {{ t(laterPages.length ? 'forms.screens.routes.help' : 'forms.screens.routes.help-last') }}
      </p>
      <div
        v-for="(route, i) in page.routes ?? []"
        :key="i"
        class="space-y-2 rounded-md border border-default p-2"
      >
        <div class="flex items-center gap-2">
          <span class="text-sm">{{ t('forms.screens.routes.go-to') }}</span>
          <USelect
            class="min-w-0 flex-1"
            size="sm"
            :model-value="targetOf(route)"
            :items="targets"
            :aria-label="t('forms.screens.routes.go-to')"
            @update:model-value="setRoute(i, { to: toTarget($event as string) })"
          />
          <IconButton
            icon="i-lucide-x"
            size="sm"
            :label="t('forms.screens.routes.remove')"
            @click="setRoutes((page.routes ?? []).filter((_, j) => j !== i))"
          />
        </div>
        <p class="text-sm text-muted">
          {{ t('forms.screens.routes.when') }}
        </p>
        <FormsConditionEditor
          :model-value="route.when"
          :questions="routeQuestions"
          @update:model-value="setRoute(i, { when: $event ?? { all: [] } })"
        />
      </div>
      <UButton
        v-if="targets.length"
        :label="t('forms.screens.routes.add')"
        icon="i-lucide-plus"
        size="sm"
        color="neutral"
        variant="soft"
        @click="addRoute"
      />
    </template>

    <!-- A calculation -->
    <FormsCalculationEditor
      v-else-if="calculation"
      :key="calculation.id"
      :calculation="calculation"
    />

    <!-- An ending -->
    <template v-else-if="ending">
      <UFormField :label="t('forms.screens.endings.title-label')">
        <UInput
          :model-value="ending.title"
          @update:model-value="editEnding((e) => { e.title = text($event) }, 'title')"
        />
      </UFormField>
      <UFormField
        :label="t('forms.screens.endings.message')"
        :hint="t('forms.screens.details.optional')"
      >
        <UTextarea
          :model-value="ending.message ?? ''"
          :rows="3"
          autoresize

          @update:model-value="editEnding((e) => { e.message = text($event) || undefined }, 'message')"
        />
      </UFormField>
      <USwitch
        :model-value="ending.submits"
        :label="t('forms.screens.endings.submits')"
        :description="t(ending.submits ? 'forms.screens.endings.submits-yes' : 'forms.screens.endings.submits-no')"
        @update:model-value="editEnding((e) => { e.submits = $event }, 'submits')"
      />
    </template>
  </div>
</template>
