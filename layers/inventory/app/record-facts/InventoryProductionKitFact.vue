<!-- The Kit fact in a production's summary strip (S15): items out and overdue, or how many lists. -->
<script setup lang="ts">
const props = defineProps<{ recordId: string }>()
const { t } = useT()
const { data, totals } = useProductionKit(() => props.recordId)
</script>

<template>
  <div v-if="data">
    <dt class="text-xs text-muted">
      {{ t('inventory.record-tabs.production.label') }}
    </dt>
    <dd class="font-medium tabular-nums text-highlighted">
      {{ totals.out ? t('inventory.kit.fact.out', totals) : totals.lists ? t('inventory.kit.fact.lists', { count: totals.lists }) : t('inventory.kit.fact.none') }}
    </dd>
  </div>
</template>
