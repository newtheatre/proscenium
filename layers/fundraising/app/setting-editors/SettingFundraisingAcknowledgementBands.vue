<!-- The editor for fundraising.acknowledgement.bands: two to eight rising amounts, where each band
     beside a donor's name begins (K3). -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<number[]>({ default: () => [] })
const { t } = useT()
const MOST = 8 // not-policy: the setting's own bound
const LEAST = 2 // not-policy: the setting's own bound
</script>

<template>
  <FundraisingAmountList
    v-model="model"
    :most="MOST"
    :least="LEAST"
    :disabled="disabled"
    :label="n => t('fundraising.settings-editor.band', { n })"
    :remove-label="n => t('fundraising.settings-editor.remove-band', { n })"
  />
</template>
