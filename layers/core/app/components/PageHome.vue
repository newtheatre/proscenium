<!-- The Home page type (UI-16): a queue, not a menu. Cards come from modules through
     `core.home-card`, sorted overdue, today, then information; a card with a zero count is absent.
     With nothing waiting the page says so and offers the two or three most common starting points.
     The console's home is ConsoleHome, which adds quick actions and headline figures. -->
<script setup lang="ts">
import type { HomeCard } from './HomeCards.vue'

const props = withDefaults(defineProps<{
  title: string
  home?: 'members' | 'tonight' | 'admin'
  /** Translation keys for the page when nothing is waiting. */
  emptyTitle?: string
  emptyDescription?: string
}>(), { home: 'admin', emptyTitle: 'core.console.home.empty.title', emptyDescription: 'core.console.home.empty.description' })

const { t } = useT()
const { data } = await useAPI<{ cards: HomeCard[], starters: { id: string, to: string, icon: string, labelKey: string }[] }>('/api/core/home', { query: { home: props.home }, key: `core:home:${props.home}`, default: () => ({ cards: [], starters: [] }) })
const cards = computed(() => data.value?.cards ?? [])
</script>

<template>
  <PageFrame :title="title">
    <HomeCards
      v-if="cards.length"
      :cards="cards"
    />
    <EmptyState
      v-else
      :title="t(emptyTitle)"
      :description="t(emptyDescription)"
      icon="i-lucide-circle-check"
    >
      <template #actions>
        <UButton
          v-for="s in data.starters"
          :key="s.id"
          :to="s.to"
          :icon="s.icon"
          color="neutral"
          variant="outline"
          :label="t(s.labelKey)"
        />
      </template>
    </EmptyState>
  </PageFrame>
</template>
