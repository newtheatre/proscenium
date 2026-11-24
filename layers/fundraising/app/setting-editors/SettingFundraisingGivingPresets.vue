<!-- The editor for fundraising.giving.presets: up to six amount buttons for the Give page, in the
     order they are shown. -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<number[]>({ default: () => [] })
const { t } = useT()
const MOST = 6 // not-policy: the setting's own bound
</script>

<template>
  <FundraisingAmountList
    v-model="model"
    :most="MOST"
    :least="1"
    :disabled="disabled"
    :label="n => t('fundraising.settings-editor.preset', { n })"
    :remove-label="n => t('fundraising.settings-editor.remove', { n })"
  />
</template>
