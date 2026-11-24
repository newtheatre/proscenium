<!-- Picks one production by searching its title, for linking an engagement (CO-12). -->
<script setup lang="ts">
defineProps<{ placeholder: string }>()
const picked = defineModel<{ id: string, label: string } | undefined>()
const { search, found, searching } = useProductionSearch({ keep: () => true })
</script>

<template>
  <UInputMenu
    v-model="picked"
    v-model:search-term="search"
    :items="found"
    :loading="searching"
    ignore-filter
    :placeholder="placeholder"
  />
</template>
