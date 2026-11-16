<!-- The frame every members' and console screen shares: one title (also the tab's title and the
     first heading), the page's one primary action, and one of three named content widths. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  /** reading (forms, settings), standard (lists, records) or full (calendars, seating plans). */
  width?: 'reading' | 'standard' | 'full'
  description?: string
}>(), { width: 'standard', description: undefined })

useHead({ title: () => props.title })
</script>

<template>
  <div
    class="mx-auto w-full px-4 py-6 sm:px-6"
    :class="`width-${width}`"
  >
    <header class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-semibold text-highlighted">
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="mt-1 text-sm text-muted"
        >
          {{ description }}
        </p>
        <slot name="status" />
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <!-- One primary action per view. A second competing button is a sign the page does two jobs. -->
        <slot name="primary" />
      </div>
    </header>
    <slot />
  </div>
</template>
