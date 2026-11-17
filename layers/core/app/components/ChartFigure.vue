<!-- A chart, with what a chart cannot give by itself: a caption, and a sentence that says what it
     shows for someone who cannot see it. A chart never replaces a figure, which stays in text beside
     it (a FactStrip, a table), and its colours are the chart's own, never the status colours: sold
     and free are not green and red. Nuxt UI draws the SVG on the server, so there is no client-only
     wrapper and nothing jumps when the page wakes. -->
<script setup lang="ts">
import type { ChartCategory, ChartData } from '@nuxt/ui'

withDefaults(defineProps<{
  /** The caption, and the chart's accessible name. */
  title: string
  /** One sentence saying what the chart shows, read out in place of it. */
  summary: string
  type?: 'line' | 'area' | 'bar' | 'donut'
  data: ChartData[]
  /** The key of each row that names it along the bottom. */
  index: string
  categories: (string | ChartCategory)[]
  /** How a value reads on the axis and in the tooltip, such as money from useMoney. */
  format?: (value: number) => string
  stacked?: boolean
  /** In pixels. The chart is as wide as its container, so a height holds its shape on a phone where a ratio would flatten it. */
  height?: number
}>(), { type: 'bar', height: 240 })

// The first and third of the theme's chart colours: the first is the brand colour and the second
// sits too close to the default brand blue to tell two series apart.
const colours = ['var(--ui-chart-1)', 'var(--ui-chart-3)', 'var(--ui-chart-6)', 'var(--ui-chart-4)']
</script>

<template>
  <figure class="space-y-2">
    <figcaption class="text-sm font-medium text-highlighted">
      {{ title }}
    </figcaption>
    <UChart
      :type="type"
      :data="data"
      :index="index"
      :categories="categories"
      :colors="colours"
      :format="format"
      :stacked="stacked"
      :height="height"
      :aria-label="title"
      :aria-description="summary"
    />
    <!-- The chart carries the same sentence as its description, so this copy is for the eye only. -->
    <p
      class="text-sm text-muted"
      aria-hidden="true"
    >
      {{ summary }}
    </p>
  </figure>
</template>
