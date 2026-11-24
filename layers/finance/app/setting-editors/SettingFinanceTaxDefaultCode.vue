<!-- The editor for finance.tax.default-code: the code sales take unless they name their own. -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<string>({ default: 'standard' })
</script>

<template>
  <FinanceTaxCodeSelect
    :model-value="model"
    :disabled="disabled"
    @update:model-value="model = $event ?? model"
  />
</template>
