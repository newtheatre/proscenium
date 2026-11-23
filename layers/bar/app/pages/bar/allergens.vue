<!-- The public allergen chart (Bar specification, tab 10; allergens step 3): what each outlet sells and
     what the labels say, the same answers as the till's Allergens sheet. Picking what someone avoids
     marks each drink: contains, may contain, not checked (ask at the bar), or none of those listed. It
     never says "free from". It prints for the bar, one outlet to a page. -->
<script setup lang="ts">
import { answerVerdict, itemVerdict, type Verdict } from '../../../shared/allergen-verdict'
import type { MatrixRow, MatrixSection } from '../../../shared/allergen-matrix'

type Allergen = 'gluten' | 'crustaceans' | 'eggs' | 'fish' | 'peanuts' | 'soya' | 'milk' | 'nuts' | 'celery' | 'mustard' | 'sesame' | 'sulphites' | 'lupin' | 'molluscs'
interface Answer { contains: Allergen[], mayContain: Allergen[], checked: boolean }
interface Row { variantId: string, product: string, size: string, allergens: Answer & { dependsOnChoice: boolean }, choices: { group: string, options: { label: string, allergens: Answer }[] }[] }
interface Chart { statement: string | null, complete: boolean, outlets: { id: string, name: string, categories: { name: string, rows: Row[] }[] }[] }

const { t } = useT()
const { data, error } = await useAPI<Chart>('/api/bar/allergens/chart', { key: 'bar:allergen-chart' })
if (error.value || !data.value) throw createError({ statusCode: 404, statusMessage: t('bar.chart.not-found'), fatal: true })
useSeoMeta({ title: () => t('bar.chart.title') })

const avoid = ref<string[]>([])
const named = (keys: string[]) => keys.map(k => t(`bar.allergen.${k}`)).join(', ')

// For someone avoiding some of the 14, the same verdict the till gives (shared/allergen-verdict). It is
// never green: at best none of what they avoid is listed.
type Note = MatrixRow['note']
const notes: Record<Verdict['kind'], (v: Verdict) => Note> = {
  'contains': v => ({ tone: 'error', text: t('bar.chart.verdict.contains', { list: named(v.hit) }) }),
  'may-contain': v => ({ tone: 'warning', text: t('bar.chart.verdict.may-contain', { list: named(v.hit) }) }),
  'not-checked': () => ({ tone: 'warning', text: t('bar.chart.verdict.not-checked') }),
  'depends': v => ({ tone: 'warning', text: t('bar.chart.verdict.depends', { groups: v.groups.map(g => g.toLocaleLowerCase('en-GB')).join(', ') }) }),
  'none-listed': () => ({ tone: 'neutral', text: t('bar.chart.verdict.none-listed') }),
}
function noteOf(row: Row): Note {
  const v = itemVerdict(avoid.value, row.allergens, row.choices)
  return v ? notes[v.kind](v) : null
}
// An option is marked only when it holds something avoided, or was never checked.
function optionNote(a: Answer): Note {
  if (!avoid.value.length) return null
  const v = answerVerdict(avoid.value, a)
  return v.kind === 'none-listed' ? null : notes[v.kind](v)
}
const asRow = (key: string, name: string, a: Answer, note: Note, sub = false): MatrixRow =>
  ({ key, name, sub, contains: a.contains, mayContain: a.mayContain, checked: a.checked ? 'all' : 'none', note: a.checked ? note : null })

// Sizes that give the same answer share a row: "House lager · Half, Pint". What can be picked on it
// follows as rows of their own, so each option's squares are marked too.
function rowsOf(rows: Row[]): MatrixRow[] {
  const out: { key: string, row: Row, sizes: string[] }[] = []
  for (const row of rows) {
    const key = `${row.product}|${JSON.stringify([row.allergens, row.choices])}`
    const found = out.find(o => o.key === key)
    if (found) found.sizes.push(row.size)
    else out.push({ key, row, sizes: [row.size] })
  }
  // A product sold one way has a single size called Each, which says nothing: the name stands alone.
  const sizesOf = (sizes: string[]) => sizes.length === 1 && sizes[0] === 'Each' ? '' : ` · ${sizes.join(t('bar.chart.sizes-separator'))}`
  return out.flatMap(o => [
    asRow(o.key, `${o.row.product}${sizesOf(o.sizes)}`, o.row.allergens, noteOf(o.row)),
    ...o.row.choices.flatMap(c => c.options.map(opt => asRow(`${o.key}|${c.group}|${opt.label}`, `${t('bar.chart.choice', { group: c.group })} ${opt.label}`, opt.allergens, optionNote(opt.allergens), true))),
  ])
}
const sectionsOf = (outlet: Chart['outlets'][number]): MatrixSection[] =>
  outlet.categories.map(c => ({ key: c.name, heading: c.name, rows: rowsOf(c.rows) }))
function print() {
  window.print()
}
</script>

<template>
  <UContainer v-if="data">
    <UPage>
      <UPageHeader
        :title="t('bar.chart.title')"
        :description="t('bar.chart.description')"
      >
        <template #links>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-printer"
            :label="t('bar.chart.print')"
            class="print:hidden"
            @click="print"
          />
        </template>
      </UPageHeader>
      <UPageBody>
        <div class="space-y-8">
          <UAlert
            v-if="!data.complete"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('bar.chart.incomplete')"
          />
          <UAlert
            v-if="data.statement"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :title="data.statement"
          />
          <p class="text-muted print:hidden">
            {{ t('bar.chart.avoid-help') }}
          </p>
          <p
            v-if="!data.outlets.length"
            class="text-muted"
          >
            {{ t('bar.chart.nothing') }}
          </p>
          <section
            v-for="outlet in data.outlets"
            :key="outlet.id"
            class="space-y-4 break-after-page"
          >
            <h2 class="text-xl font-semibold">
              {{ outlet.name }}
            </h2>
            <BarAllergenMatrix
              v-model:avoid="avoid"
              :sections="sectionsOf(outlet)"
              :caption="t('bar.chart.caption', { outlet: outlet.name })"
              :not-checked="t('bar.chart.not-checked')"
              frame="max-h-[85dvh]"
            />
          </section>
          <p class="text-sm text-muted">
            {{ t('bar.chart.footer') }}
          </p>
        </div>
      </UPageBody>
    </UPage>
  </UContainer>
</template>

<style>
/* Printed for the bar: A4, the chart only, and nothing that depends on what one person ticked. */
@page {
  size: A4;
}
@media print {
  header,
  footer {
    display: none !important;
  }
}
</style>
