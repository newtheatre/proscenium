<script setup lang="ts">
// The whole card is the one link, so a tile is a thumb's target rather than a line of small text,
// and its action is said last, after what it shows (K-127 criterion 6, issue 1153 item 3).
withDefaults(defineProps<{
  title: string
  to: string
  label: string
  highlight?: boolean
  empty?: boolean
  emptyTitle?: string
}>(), { highlight: false, empty: false, emptyTitle: undefined })
</script>

<template>
  <div :data-test="`my-tile-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`">
    <UPageCard
      :title="title"
      :to="to"
      :aria-label="`${title}: ${label}`"
      :highlight="highlight"
      highlight-color="primary"
      :ui="{ root: 'h-full min-h-12', container: 'h-full' }"
    >
      <div class="flex flex-1 flex-col gap-4">
        <UEmpty
          v-if="empty"
          variant="naked"
          size="sm"
          :title="emptyTitle"
        />
        <div
          v-else
          class="flex-1"
        >
          <slot />
        </div>
        <span class="text-sm font-medium text-primary">
          {{ label }}
        </span>
      </div>
    </UPageCard>
  </div>
</template>
