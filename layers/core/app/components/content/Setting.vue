<!-- A content token: :setting{name="core.locale.currency"} shows a quotable setting's current value,
     so a page never states a figure the console can change. The conformance check fails a page that
     quotes an unknown or unquotable setting. -->
<script setup lang="ts">
const props = defineProps<{ name: string }>()
const { data } = await usePublicSettings()
const text = computed(() => data.value?.[props.name]?.text ?? '')
</script>

<template>
  <span data-setting>{{ text }}</span>
</template>
