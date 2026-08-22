<!--
What a page shows when its data did not load. An empty table otherwise reads
as "there are no venues".
-->
<script setup lang="ts">
defineProps<{
  error: unknown
  /** Omit to hide the retry button: e.g. where a refresh handler isn't to hand. */
  onRetry?: () => void
  title?: string
}>()
</script>

<template>
  <UAlert
    color="error"
    variant="subtle"
    icon="i-lucide-triangle-alert"
    :title="title ?? 'Could not load this data'"
    :description="getErrorMessage(error, 'Something went wrong. Try again, and if it keeps happening the server may be down.')"
  >
    <template
      v-if="onRetry"
      #actions
    >
      <UButton
        label="Try again"
        color="error"
        variant="outline"
        size="sm"
        icon="i-lucide-rotate-ccw"
        @click="onRetry"
      />
    </template>
  </UAlert>
</template>
