<!-- A content token: :setting{name="core.locale.currency"} shows a quotable setting's current value,
     so a page never states a figure the console can change. The conformance check fails a page that
     quotes an unknown or unquotable setting. `fallback` is what shows while the setting has no value. -->
<script setup lang="ts">
const props = defineProps<{ name: string, fallback?: string }>()
const { data } = await usePublicSettings()
const text = computed(() => data.value?.[props.name]?.text || props.fallback || '')
</script>

<template>
  <span data-setting>{{ text }}</span>
</template>
