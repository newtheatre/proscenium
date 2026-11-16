<script setup lang="ts">
defineProps<{ count?: number }>()
</script>

<template>
  <div>
    <p class="font-medium">
      {{ count }} sample drafts are waiting.
    </p>
    <UButton
      to="/console/gallery/drafts"
      label="Review drafts"
      variant="link"
      class="px-0"
    />
  </div>
</template>
