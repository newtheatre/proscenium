<!-- A content token: :fact{name="payments.card-providers"} shows a value the system works out where no
     setting holds it. `fallback` is what shows while there is none. -->
<script setup lang="ts">
const props = defineProps<{ name: string, fallback?: string }>()
const { data } = await usePolicyContext()
const text = computed(() => data.value?.facts?.[props.name]?.text || props.fallback || '')
</script>

<template>
  <span data-fact>{{ text }}</span>
</template>
