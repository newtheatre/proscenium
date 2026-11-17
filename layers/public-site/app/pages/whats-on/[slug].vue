<!-- A production's public page at /whats-on/<slug> (C-39, C-46). PublicSiteProduction moves it to the other
     prefix when it belongs there, and an old slug to the current one. -->
<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <PublicSiteProduction
    :slug="String(route.params.slug)"
    prefix="whats-on"
  />
</template>
