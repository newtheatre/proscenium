<script setup lang="ts">
// The help link every shell renders: the page names its documentation in definePageMeta and
// nothing renders when it names none (J-109 criterion 1).
const route = useRoute()
const docs = computed(() => route.meta.docs)
</script>

<template>
  <UButton
    v-if="docs"
    :to="docs"
    icon="i-lucide-circle-help"
    variant="ghost"
    color="neutral"
    aria-label="Help for this screen"
    data-test="docs-link"
  />
</template>
