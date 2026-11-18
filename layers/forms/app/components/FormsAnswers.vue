<!-- The answers of one response, read back against the version of the form they were given on:
     page by page, in the form's order, with nothing shown for a question that was not answered.
     A restricted answer says so and shows nothing else. -->
<script setup lang="ts">
import type { DataClass, Definition, FileRef, Question, Value } from '../../shared/engine'

export interface ShownAnswer { questionId: string, repeatIndex: number, dataClass: DataClass, restricted: boolean, value: Value, other: string | null, label: string | null }

const props = defineProps<{ definition: Definition, answers: ShownAnswer[], /** Questions whose answers differ from the revision before: each is marked. */ changed?: string[] }>()
const { t } = useT()
const { day, dateTime } = useDates()

const of = (id: string) => props.answers.filter(a => a.questionId === id)
function words(q: Question, a: ShownAnswer): string {
  if (a.label !== null) return a.label
  const v = a.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? t('forms.screens.logic.yes') : t('forms.screens.logic.no')
  if (typeof v === 'number') return q.type === 'money' ? (v / 100).toFixed(2) : String(v) // not-policy: minor units to units
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
      label: item.kind === 'group' ? `${item.label} ${a.repeatIndex + 1}: ${formsQuestionName(q)}` : formsQuestionName(q),
      restricted: a.restricted,
      changed: !!props.changed?.includes(q.id),
      text: a.restricted ? '' : words(q, a),
      // A file answer reads as links to the files, which open for whoever may read the response.
      files: !a.restricted && q.type === 'file' && Array.isArray(a.value) ? a.value as FileRef[] : null,
    })))
  }),
})).filter(p => p.rows.length))
</script>

<template>
  <div class="space-y-6">
    <p
      v-if="!pages.length"
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
        >
          <dt class="text-sm text-muted">
            {{ row.label }}
            <StatusBadge
              v-if="row.changed"
              tone="info"
              :label="t('forms.screens.answers.changed')"
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
      </dl>
    </section>
  </div>
</template>
