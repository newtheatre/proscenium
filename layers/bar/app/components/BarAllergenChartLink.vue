<!-- A link to the public allergen chart, for a theatre's own pages: ::allergen-chart in a content file
     (public components). It shows nothing while the chart is switched off or not published. `label`
     changes its words. -->
<script setup lang="ts">
const props = defineProps<{ label?: string }>()
const { t } = useT()
// The chart answers "not found" when it is not published, so the link is then left out. The chart page
// shares this request's key, so following the link costs nothing more.
const { data } = await useAPI<{ outlets: unknown[] }>('/api/bar/allergens/chart', { key: 'bar:allergen-chart' })
</script>

<template>
  <UButton
    v-if="data"
    to="/bar/allergens"
    variant="outline"
    icon="i-lucide-wheat"
    :label="props.label || t('bar.chart.link')"
  />
</template>
