<script setup lang="ts">
// The two halves of the one Rota entry: the board, and Bar openings for an opening's own life (0253).
defineProps<{ current: 'board' | 'openings' }>()

const tabs = [
  { key: 'board', label: 'Board', icon: 'i-lucide-users-round', to: '/rota/manage/shifts' },
  { key: 'openings', label: 'Bar openings', icon: 'i-lucide-store', to: '/rota/manage/openings' },
] as const
</script>

<template>
  <nav
    class="flex gap-1 border-b border-default"
    aria-label="Rota"
    data-test="rota-tabs"
  >
    <UButton
      v-for="tab in tabs"
      :key="tab.key"
      :to="tab.to"
      :icon="tab.icon"
      variant="link"
      :color="tab.key === current ? 'primary' : 'neutral'"
      class="-mb-px rounded-none border-b-2"
      :class="tab.key === current ? 'border-primary' : 'border-transparent'"
      :aria-current="tab.key === current ? 'page' : undefined"
      :data-test="`rota-tab-${tab.key}`"
    >
      {{ tab.label }}
    </UButton>
  </nav>
</template>
