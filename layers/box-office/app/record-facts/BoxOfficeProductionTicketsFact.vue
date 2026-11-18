<!-- The Tickets fact in a production's summary strip (core.record-fact): seats taken across the run
     and how many performances are on sale. -->
<script setup lang="ts">
const props = defineProps<{ recordId: string }>()
const { t } = useT()
const { data } = await useProductionTickets(() => props.recordId)
</script>

<template>
  <div v-if="data">
    <dt class="text-xs text-muted">
      {{ t('box-office.production-tickets.fact.label') }}
    </dt>
    <dd class="font-medium tabular-nums text-highlighted">
      {{ data.totals.performances ? t('box-office.production-tickets.fact.value', { taken: data.totals.taken, onSale: data.totals.onSale, performances: data.totals.performances }) : t('box-office.production-tickets.fact.none') }}
    </dd>
  </div>
</template>
