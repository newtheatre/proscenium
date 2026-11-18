<!-- The public allergen chart (Bar specification, tab 10; allergens step 3): what each outlet sells and
     what the labels say, the same answers as the till's Allergens sheet. Picking what someone avoids
     marks each drink: contains, may contain, not checked (ask at the bar), or none of those listed. It
     never says "free from". It prints for the bar, one outlet to a page. -->
<script setup lang="ts">
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
const named = (keys: Allergen[]) => keys.map(k => t(`bar.allergen.${k}`)).join(', ')

// One answer in words: what it lists, or that nothing was checked.
function says(a: Answer): string {
  if (!a.checked) return t('bar.chart.not-checked')
  if (!a.contains.length && !a.mayContain.length) return t('bar.chart.none-listed')
  return [a.contains.length ? t('bar.chart.contains', { list: named(a.contains) }) : null, a.mayContain.length ? t('bar.chart.may-contain', { list: named(a.mayContain) }) : null].filter(Boolean).join(' · ')
}
// For someone avoiding some of the 14: the worst of contains, may contain or not checked.
function verdict(a: Answer): { tone: 'danger' | 'warning' | 'neutral', label: string } | null {
  if (!avoid.value.length) return null
  const hit = avoid.value.filter(k => a.contains.includes(k))
  if (hit.length) return { tone: 'danger', label: t('bar.chart.verdict.contains', { list: named(hit) }) }
  if (!a.checked) return { tone: 'warning', label: t('bar.chart.verdict.not-checked') }
  const may = avoid.value.filter(k => a.mayContain.includes(k))
  if (may.length) return { tone: 'warning', label: t('bar.chart.verdict.may-contain', { list: named(may) }) }
  return { tone: 'neutral', label: t('bar.chart.verdict.none-listed') }
}
// The item's own answer, then each choice's options with theirs, marked when someone avoids them.
function describe(row: Row): string {
  const choices = row.choices.map(c => `${t('bar.chart.choice', { group: c.group })} ${c.options.map((o) => {
    const v = verdict(o.allergens)
    return `${o.label}: ${says(o.allergens)}${v && v.tone !== 'neutral' ? ` (${v.label})` : ''}`
  }).join('; ')}`)
  return [says(row.allergens), ...choices].join(' · ')
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
              class="flex-wrap"
              :ui="{ fieldset: 'flex-wrap gap-x-4 gap-y-2' }"
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
                  v-for="row in category.rows"
                  :key="row.variantId"
                  :name="`${row.product} · ${row.size}`"
                  :description="describe(row)"
                  class="break-inside-avoid"
                >
                  <StatusBadge
                    v-if="verdict(row.allergens)"
                    :tone="verdict(row.allergens)!.tone"
                    :label="verdict(row.allergens)!.label"
                  />
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
