<!-- Blocks other modules add to a production's or a venue's public page (C-69), each a global component
     from a layer's app/public-sections, given the page's subject. A name nobody answers to is left out. -->
<script setup lang="ts">
const props = defineProps<{ sections: { id: string, component: string }[], subject: Record<string, string> }>()
const { vueApp } = useNuxtApp()
const shown = computed(() => props.sections.flatMap((s) => {
  const component = vueApp.component(s.component)
  return component ? [{ id: s.id, component }] : []
}))
</script>

<template>
  <component
    :is="s.component"
    v-for="s in shown"
    :key="s.id"
    v-bind="subject"
  />
</template>
