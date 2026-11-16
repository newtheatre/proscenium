<!-- A sample tab another module adds to a production's record page. -->
<script setup lang="ts">
defineProps<{ recordId: string }>()
</script>

<template>
  <p data-testid="gallery-tickets-tab">
    Sample tickets for {{ recordId }}.
  </p>
</template>
