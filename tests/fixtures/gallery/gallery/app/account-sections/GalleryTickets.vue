<script setup lang="ts">
defineProps<{ headingId: string }>()
</script>

<template>
  <div>
    <h2
      :id="headingId"
      class="text-lg font-semibold"
    >
      Sample tickets section
    </h2>
    <p class="text-muted">
      Tickets from the gallery appear here.
    </p>
  </div>
</template>
