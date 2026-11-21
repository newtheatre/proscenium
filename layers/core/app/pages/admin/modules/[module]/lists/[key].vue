<script setup lang="ts">
// One of a module's lists, on its Lists tab: the terms a picker in that module offers.
const route = useRoute()
const module = computed(() => String(route.params.module))
</script>

<template>
  <VocabularyTerms
    :list-key="String(route.params.key)"
    :trail="[{ label: 'Lists', to: `/admin/modules/${module}/lists` }]"
  />
</template>
