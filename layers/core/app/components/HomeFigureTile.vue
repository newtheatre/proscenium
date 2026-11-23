<!-- One tile of the console home's grid (core.home-figure): a module's headline figure in large type,
     a line under it, and its chart. The figure always stays in text; the chart only adds the shape. -->
<script setup lang="ts">
export interface FigureText { key: string, params?: Record<string, string | number> }
export interface ShownFigure {
  id: string
  label: string
  size: 'small' | 'wide' | 'tall'
  to?: string
  value: number | null
  unit?: string
  detail?: FigureText
  chart?: {
    type: 'bar' | 'line' | 'area' | 'meters'
    series: { key: string, label: string }[]
    rows: { date?: string, month?: string, at?: number, label?: string, values: Record<string, number>, max?: number }[]
    summary: FigureText
  }
}

const props = defineProps<{ figure: ShownFigure }>()
const { t } = useT()
const { language, dayAxis, monthBrief, brief, dayBrief, time } = useDates()

const CURRENCY = /^[A-Z]{3}$/ // not-policy: an ISO currency code's shape
function format(value: number): string {
  const unit = props.figure.unit
  if (unit && CURRENCY.test(unit)) {
    const money = new Intl.NumberFormat(language.value, { style: 'currency', currency: unit })
    return money.format(value / 10 ** (money.resolvedOptions().maximumFractionDigits ?? 2))
  }
  if (unit === 'percent') return new Intl.NumberFormat(language.value, { style: 'percent' }).format(value / 100) // not-policy: a whole percentage
  return new Intl.NumberFormat(language.value).format(value)
}
// Money on an axis drops its pence: the exact sum is the figure above it.
function axis(value: number): string {
  const unit = props.figure.unit
  if (!unit || !CURRENCY.test(unit)) return format(value)
  const money = new Intl.NumberFormat(language.value, { style: 'currency', currency: unit, maximumFractionDigits: 0 })
  return money.format(value / 10 ** (new Intl.NumberFormat(language.value, { style: 'currency', currency: unit }).resolvedOptions().maximumFractionDigits ?? 2))
}

const label = computed(() => t(props.figure.label))
const text = (f?: FigureText) => (f ? t(f.key, f.params) : '')
type Row = NonNullable<ShownFigure['chart']>['rows'][number]
const rowName = (r: Row) => r.date ? dayAxis(r.date) : r.month ? monthBrief(`${r.month}-01`) : r.at ? brief(r.at) : (r.label ?? '')
const chart = computed(() => props.figure.chart)
// A chart of nothing but noughts is an empty box with an axis: the figure above already says nought.
const drawn = computed(() => chart.value && chart.value.type !== 'meters' && chart.value.rows.length > 1 && chart.value.rows.some(r => Object.values(r.values).some(v => v !== 0))
  ? chart.value.rows.map(r => ({ name: rowName(r), ...r.values }))
  : [])
const meters = computed(() => chart.value?.type === 'meters' ? chart.value.rows : [])
const span = { small: '', wide: 'sm:col-span-2', tall: 'sm:row-span-2' } as const
</script>

<template>
  <UCard
    as="section"
    :aria-labelledby="`figure-${figure.id}`"
    :class="span[figure.size]"
    :ui="{ root: 'flex flex-col', body: 'flex flex-1 flex-col gap-4 p-4 sm:p-5' }"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0 space-y-1">
        <h2
          :id="`figure-${figure.id}`"
          class="text-sm font-medium text-muted"
        >
          {{ label }}
        </h2>
        <p class="text-3xl font-semibold tabular-nums text-highlighted">
          {{ figure.value === null ? t('core.home-figures.no-value') : format(figure.value) }}
        </p>
        <p
          v-if="figure.detail"
          class="text-sm text-muted"
        >
          {{ text(figure.detail) }}
        </p>
      </div>
      <IconButton
        v-if="figure.to"
        :to="figure.to"
        icon="i-lucide-arrow-up-right"
        :label="t('core.console.home.look-closer', { what: label })"
        class="-me-2 -mt-1 shrink-0"
      />
    </div>
    <ChartFigure
      v-if="chart && drawn.length"
      class="mt-auto"
      quiet
      :type="chart.type === 'meters' ? 'bar' : chart.type"
      :title="label"
      :summary="text(chart.summary)"
      :data="drawn"
      index="name"
      :categories="chart.series.map(s => ({ key: s.key, label: t(s.label) }))"
      :format="axis"
      :height="figure.size === 'small' ? 96 : 140"
    />
    <figure v-else-if="chart && meters.length">
      <figcaption class="sr-only">
        {{ text(chart.summary) }}
      </figcaption>
      <ul class="space-y-3">
        <li
          v-for="(r, i) in meters"
          :key="i"
          class="space-y-1"
        >
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="min-w-0">
              <span class="block truncate font-medium text-highlighted">{{ r.label }}</span>
              <span
                v-if="r.at"
                class="block text-xs text-muted"
              >{{ dayBrief(r.at) }}, {{ time(r.at) }}</span>
            </span>
            <span class="shrink-0 tabular-nums text-muted">{{ t('core.home-figures.meter', { value: Object.values(r.values)[0] ?? 0, max: r.max ?? 0 }) }}</span>
          </div>
          <UProgress
            :model-value="Object.values(r.values)[0] ?? 0"
            :max="r.max || 1"
            size="sm"
            :aria-label="`${r.label}${r.at ? `, ${dayBrief(r.at)}, ${time(r.at)}` : ''}`"
          />
        </li>
      </ul>
    </figure>
  </UCard>
</template>
