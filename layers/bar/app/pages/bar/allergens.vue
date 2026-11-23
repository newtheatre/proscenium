<!-- The public allergen chart (Bar specification, tab 10; allergens step 3): what each outlet sells and
     what the labels say, the same answers as the till's Allergens sheet. Picking what someone avoids
     marks each drink: contains, may contain, not checked (ask at the bar), or none of those listed. It
     never says "free from". It prints for the bar, one outlet to a page. -->
<script setup lang="ts">
import { answerVerdict, itemVerdict, type Verdict } from '../../../shared/allergen-verdict'

type Allergen = 'gluten' | 'crustaceans' | 'eggs' | 'fish' | 'peanuts' | 'soya' | 'milk' | 'nuts' | 'celery' | 'mustard' | 'sesame' | 'sulphites' | 'lupin' | 'molluscs'
interface Answer { contains: Allergen[], mayContain: Allergen[], checked: boolean }
interface Row { variantId: string, product: string, size: string, allergens: Answer & { dependsOnChoice: boolean }, choices: { group: string, options: { label: string, allergens: Answer }[] }[] }
interface Chart { statement: string | null, complete: boolean, outlets: { id: string, name: string, categories: { name: string, rows: Row[] }[] }[] }

const ALLERGENS: Allergen[] = ['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soya', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs']
const { t } = useT()
const { data, error } = await useAPI<Chart>('/api/bar/allergens/chart', { key: 'bar:allergen-chart' })
if (error.value || !data.value) throw createError({ statusCode: 404, statusMessage: t('bar.chart.not-found'), fatal: true })
useSeoMeta({ title: () => t('bar.chart.title') })

const avoid = ref<Allergen[]>([])
const avoidItems = computed(() => ALLERGENS.map(k => ({ value: k, label: t(`bar.allergen.${k}`) })))
const named = (keys: string[]) => keys.map(k => t(`bar.allergen.${k}`)).join(', ')

// One answer in words: what it lists, or that nothing was checked.
function says(a: Answer): string {
  if (!a.checked) return t('bar.chart.not-checked')
  if (!a.contains.length && !a.mayContain.length) return t('bar.chart.none-listed')
  return [a.contains.length ? t('bar.chart.contains', { list: named(a.contains) }) : null, a.mayContain.length ? t('bar.chart.may-contain', { list: named(a.mayContain) }) : null].filter(Boolean).join(' · ')
}
// A row's own answer in words. An item made from its choices has none of its own to say.
const ownSays = (row: Row) => (row.choices.length && row.allergens.checked && !row.allergens.contains.length && !row.allergens.mayContain.length ? null : says(row.allergens))

// For someone avoiding some of the 14, the same verdict the till gives (shared/allergen-verdict).
const verdicts = {
  'contains': (v: Verdict) => ({ tone: 'danger' as const, label: t('bar.chart.verdict.contains', { list: named(v.hit) }) }),
  'may-contain': (v: Verdict) => ({ tone: 'warning' as const, label: t('bar.chart.verdict.may-contain', { list: named(v.hit) }) }),
  'not-checked': () => ({ tone: 'warning' as const, label: t('bar.chart.verdict.not-checked') }),
  'depends': (v: Verdict) => ({ tone: 'warning' as const, label: t('bar.chart.verdict.depends', { groups: v.groups.map(g => g.toLocaleLowerCase('en-GB')).join(', ') }) }),
  'none-listed': () => ({ tone: 'neutral' as const, label: t('bar.chart.verdict.none-listed') }),
}
function verdictOf(row: Row) {
  const v = itemVerdict(avoid.value, row.allergens, row.choices)
  return v ? verdicts[v.kind](v) : null
}
// Whether an option is one of the things someone avoids, or unchecked, so it can be marked.
const flagged = (a: Answer) => !!avoid.value.length && answerVerdict(avoid.value, a).kind !== 'none-listed'

// Sizes that give the same answer share a row: "House lager · Half, Pint".
interface Shown { key: string, name: string, row: Row }
function shown(rows: Row[]): Shown[] {
  const out: { key: string, row: Row, sizes: string[] }[] = []
  for (const row of rows) {
    const key = `${row.product}|${JSON.stringify([row.allergens, row.choices])}`
    const found = out.find(o => o.key === key)
    if (found) found.sizes.push(row.size)
    else out.push({ key, row, sizes: [row.size] })
  }
  // A product sold one way has a single size called Each, which says nothing: the name stands alone.
  const sizesOf = (sizes: string[]) => sizes.length === 1 && sizes[0] === 'Each' ? '' : ` · ${sizes.join(t('bar.chart.sizes-separator'))}`
  return out.map(o => ({ key: o.key, name: `${o.row.product}${sizesOf(o.sizes)}`, row: o.row }))
}
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
          <UFormField
            :label="t('bar.chart.avoid')"
            :help="t('bar.chart.avoid-help')"
            class="print:hidden"
          >
            <UCheckboxGroup
              v-model="avoid"
              :items="avoidItems"
              orientation="horizontal"
              size="lg"
              :ui="{ fieldset: 'grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-y-2' }"
            />
          </UFormField>
          <p
            v-if="!data.outlets.length"
            class="text-muted"
          >
            {{ t('bar.chart.nothing') }}
          </p>
          <section
            v-for="outlet in data.outlets"
            :key="outlet.id"
            class="space-y-6 break-after-page"
          >
            <h2 class="text-xl font-semibold">
              {{ outlet.name }}
            </h2>
            <div
              v-for="category in outlet.categories"
              :key="category.name"
              class="space-y-2"
            >
              <h3 class="font-medium text-muted">
                {{ category.name }}
              </h3>
              <RecordList :label="`${outlet.name}: ${category.name}`">
                <RecordListItem
                  v-for="r in shown(category.rows)"
                  :key="r.key"
                  :name="r.name"
                  :description="ownSays(r.row) ?? undefined"
                  class="break-inside-avoid"
                >
                  <template v-if="verdictOf(r.row)">
                    <UBadge
                      v-if="verdictOf(r.row)!.tone === 'neutral'"
                      color="neutral"
                      variant="subtle"
                      :label="verdictOf(r.row)!.label"
                      class="print:hidden"
                    />
                    <StatusBadge
                      v-else
                      :tone="verdictOf(r.row)!.tone"
                      :label="verdictOf(r.row)!.label"
                      class="print:hidden"
                    />
                  </template>
                  <template
                    v-if="r.row.choices.length"
                    #below
                  >
                    <div
                      v-for="c in r.row.choices"
                      :key="c.group"
                      class="space-y-1"
                    >
                      <p class="text-sm font-medium text-muted">
                        {{ t('bar.chart.choice', { group: c.group }) }}
                      </p>
                      <ul class="space-y-0.5 text-sm text-muted">
                        <li
                          v-for="o in c.options"
                          :key="o.label"
                          :class="flagged(o.allergens) && 'font-semibold text-default print:font-normal print:text-muted'"
                        >
                          <UIcon
                            v-if="flagged(o.allergens)"
                            name="i-lucide-triangle-alert"
                            class="mr-1 inline size-4 align-text-bottom print:hidden"
                            aria-hidden="true"
                          />{{ o.label }}: {{ says(o.allergens) }}
                        </li>
                      </ul>
                    </div>
                  </template>
                </RecordListItem>
              </RecordList>
            </div>
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
