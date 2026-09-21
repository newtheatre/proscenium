<script setup lang="ts">
// One control shape per action kind across the grid (K-127 criterion 6): going to a screen is a
// link on every tile, whether the tile is full or empty.
const props = withDefaults(defineProps<{
  title: string
  to: string
  label: string
  highlight?: boolean
  empty?: boolean
  emptyTitle?: string
  emptyLabel?: string
}>(), { highlight: false, empty: false, emptyTitle: undefined, emptyLabel: undefined })

const footerLabel = computed(() => (props.empty ? props.emptyLabel ?? props.label : props.label))
</script>

<template>
  <UPageCard
    :title="title"
    :highlight="highlight"
    :data-test="`my-tile-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`"
    highlight-color="primary"
    :ui="{ container: 'h-full', body: 'flex-1' }"
  >
    <UEmpty
      v-if="empty"
      variant="naked"
      size="sm"
      :title="emptyTitle"
    />
    <slot v-else />

    <template #footer>
      <ULink
        :to="to"
        class="text-sm font-medium text-primary"
      >
        {{ footerLabel }}
      </ULink>
    </template>
  </UPageCard>
</template>
