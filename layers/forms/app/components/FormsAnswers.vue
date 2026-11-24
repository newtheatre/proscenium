<!-- The answers of one response, read back against the version of the form they were given on:
     page by page, in the form's order, with nothing shown for a question that was not answered.
     A restricted answer says so and shows nothing else. The calculated values the server worked out
     when it was sent follow the answers of the page they were shown on; those shown nowhere come last,
     for staff only. -->
<script setup lang="ts">
import type { DataClass, Definition, FileRef, Question, Value } from '../../shared/engine'
import type { Figure } from '../../shared/figures'
import { moneyWords } from '../../shared/words'

export interface ShownAnswer { questionId: string, repeatIndex: number, dataClass: DataClass, restricted: boolean, value: Value, other: string | null, label: string | null }

const props = defineProps<{
  definition: Definition
  answers: ShownAnswer[]
  /** Questions whose answers differ from the revision before: each is marked. */
  changed?: string[]
  /** The calculated values the server stored, by calculation id. Left out, none are shown. */
  calculated?: Record<string, Figure> | null
  /** Only the calculations the person answering was shown on a page, as on their own copy. */
  placedOnly?: boolean
  /** How each marked question was marked, by question id, for staff reading a quiz (FB-513). */
  marks?: Record<string, { correct: boolean, points: number, outOf: number }> | null
}>()
const { t } = useT()
const { day, dateTime } = useDates()
const { figure, figureName } = useFormsFigures()
const figures = (onPage: (page: string | undefined) => boolean) => props.calculated
  ? (props.definition.calculations ?? []).filter(c => onPage(c.page) && props.calculated![c.id] !== undefined).map(c => ({ key: `calc:${c.id}`, id: c.id, label: figureName(c), text: figure(c, props.calculated![c.id]) }))
  : []
const unplaced = computed(() => props.placedOnly ? [] : figures(page => !props.definition.pages.some(p => p.id === page)))
const { data: settings } = usePublicSettings()
const currency = computed(() => (settings.value?.['core.locale.currency']?.value as string | undefined) ?? 'GBP')

const of = (id: string) => props.answers.filter(a => a.questionId === id)
function words(q: Question, a: ShownAnswer): string {
  if (a.label !== null) return a.label
  const v = a.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? t('forms.screens.logic.yes') : t('forms.screens.logic.no')
  if (typeof v === 'number') return q.type === 'money' ? moneyWords(v, currency.value) : String(v)
  if (typeof v === 'string') return q.type === 'date' ? day(v) : q.type === 'datetime' ? dateTime(new Date(v)) : v
  if (Array.isArray(v)) return v.map(x => typeof x === 'string' ? x : x.name).join(', ')
  return [v.line1, v.line2, v.town, v.county, v.postcode, v.country].filter(Boolean).join(', ')
}
const pages = computed(() => props.definition.pages.map((page, i) => ({
  id: page.id,
  title: page.title || t('forms.screens.builder.page-n', { n: i + 1 }),
  rows: page.items.flatMap((item) => {
    const questions = item.kind === 'question' ? [item] : item.kind === 'row' || item.kind === 'group' ? item.items : []
    return questions.flatMap(q => of(q.id).map(a => ({
      key: `${q.id}.${a.repeatIndex}`,
      label: formsQuestionName(q),
      // An entry of a repeating group is read under the group's name and its number.
      entry: item.kind === 'group' ? { name: item.label, n: a.repeatIndex + 1 } : null,
      restricted: a.restricted,
      changed: !!props.changed?.includes(q.id),
      mark: item.kind === 'group' ? null : props.marks?.[q.id] ?? null,
      text: a.restricted ? '' : words(q, a),
      // A file answer reads as links to the files, which open for whoever may read the response.
      files: !a.restricted && q.type === 'file' && Array.isArray(a.value) ? a.value as FileRef[] : null,
    }))).sort((a, b) => (a.entry?.n ?? 0) - (b.entry?.n ?? 0))
      .map((row, i, rows) => ({ ...row, heading: row.entry && (i === 0 || rows[i - 1]!.entry?.n !== row.entry.n) ? row.entry : null }))
  }),
  figures: figures(id => id === page.id),
})).filter(p => p.rows.length || p.figures.length))
</script>

<template>
  <div class="space-y-6">
    <p
      v-if="!pages.length && !unplaced.length"
      class="text-muted"
    >
      {{ t('forms.screens.answers.none') }}
    </p>
    <section
      v-for="page in pages"
      :key="page.id"
      class="space-y-2"
    >
      <h3
        v-if="definition.pages.length > 1"
        class="text-sm font-medium text-muted"
      >
        {{ page.title }}
      </h3>
      <dl class="divide-y divide-default">
        <div
          v-for="row in page.rows"
          :key="row.key"
          class="grid gap-1 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4"
          :class="row.entry ? 'ps-3' : ''"
        >
          <p
            v-if="row.heading"
            class="-ms-3 text-sm font-medium sm:col-span-2"
          >
            {{ t('forms.screens.answers.entry', { name: row.heading.name, n: row.heading.n }) }}
          </p>
          <dt class="text-sm text-muted">
            {{ row.label }}
            <StatusBadge
              v-if="row.changed"
              tone="info"
              :label="t('forms.screens.answers.changed')"
            />
            <StatusBadge
              v-if="row.mark"
              :tone="row.mark.correct ? 'success' : 'danger'"
              :label="t('forms.screens.marking.points', { points: row.mark.points, outOf: row.mark.outOf })"
            />
          </dt>
          <dd class="whitespace-pre-wrap break-words">
            <StatusBadge
              v-if="row.restricted"
              tone="neutral"
              :label="t('forms.screens.answers.restricted')"
            />
            <FormsFileList
              v-else-if="row.files"
              :files="row.files"
              linked
            />
            <template v-else>
              {{ row.text }}
            </template>
          </dd>
        </div>
        <div
          v-for="row in page.figures"
          :key="row.key"
          :data-calculation="row.id"
          class="grid gap-1 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4"
        >
          <dt class="text-sm text-muted">
            {{ row.label }}
          </dt>
          <dd class="font-medium tabular-nums">
            {{ row.text || '–' }}
          </dd>
        </div>
      </dl>
    </section>
    <section
      v-if="unplaced.length"
      class="space-y-2"
    >
      <h3 class="text-sm font-medium text-muted">
        {{ t('forms.screens.answers.worked-out') }}
      </h3>
      <dl class="divide-y divide-default">
        <div
          v-for="row in unplaced"
          :key="row.key"
          :data-calculation="row.id"
          class="grid gap-1 py-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4"
        >
          <dt class="text-sm text-muted">
            {{ row.label }}
          </dt>
          <dd class="font-medium tabular-nums">
            {{ row.text || '–' }}
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>
