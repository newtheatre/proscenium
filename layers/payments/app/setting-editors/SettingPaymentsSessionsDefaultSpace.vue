<!-- The editor for payments.sessions.default-space: where the till opens a session on a device that
     has not used one before. Unknown leaves the setting unset. -->
<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
const model = defineModel<string | null>({ default: null })
</script>

<template>
  <PaymentsSessionPlace
    v-model="model"
    :disabled="disabled"
  />
</template>
