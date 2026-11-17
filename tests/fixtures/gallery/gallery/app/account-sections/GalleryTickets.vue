<script setup lang="ts">
defineProps<{ headingId: string }>()
</script>

<template>
  <AccountCard
    :heading-id="headingId"
    title="Sample tickets section"
    description="Tickets from the gallery appear here."
    to="/account/gallery"
    icon="i-lucide-ticket"
  />
</template>
