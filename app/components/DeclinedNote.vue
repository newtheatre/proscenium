<script setup lang="ts">
// A declined claim says why on the member's own card, and what Dismiss does (0213).
defineProps<{ reason: string | null }>()
</script>

<template>
  <div class="mt-2 space-y-1 text-sm">
    <p v-if="reason">
      <span class="font-medium">Why:</span> {{ reason }}
    </p>
    <p class="text-muted">
      Dismiss clears this from your list and puts the shift back on offer.
    </p>
  </div>
</template>
