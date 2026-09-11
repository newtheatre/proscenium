<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  to: string
  label: string
  highlight?: boolean
  empty?: boolean
  emptyTitle?: string
  emptyLabel?: string
}>(), { highlight: false, empty: false, emptyTitle: undefined, emptyLabel: undefined })
</script>

<template>
  <UPageCard
    :title="title"
    :highlight="highlight"
    highlight-color="primary"
    :ui="{ container: 'h-full', body: 'flex-1' }"
  >
    <UEmpty
      v-if="empty"
      variant="naked"
      size="sm"
      :title="emptyTitle"
      :actions="emptyLabel ? [{ label: emptyLabel, to, variant: 'subtle', color: 'neutral' }] : []"
    />
    <slot v-else />

    <template
      v-if="!empty"
      #footer
    >
      <ULink
        :to="to"
        class="text-sm font-medium text-primary"
      >
        {{ label }}
      </ULink>
    </template>
  </UPageCard>
</template>
