<!-- The Home page type (UI-16): a queue, not a menu. Cards come from modules through
     `core.home-card`, sorted overdue, today, then information; a card with a zero count is absent.
     With nothing waiting the page says so and offers the two or three most common starting points. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  home?: 'console' | 'members' | 'tonight' | 'admin'
  /** Translation keys for the page when nothing is waiting; the console's own by default. */
  emptyTitle?: string
  emptyDescription?: string
}>(), { home: 'console', emptyTitle: 'core.console.home.empty.title', emptyDescription: 'core.console.home.empty.description' })

const { t } = useT()
interface Card { id: string, component: string, urgency: 'overdue' | 'today' | 'info', count?: number }
const { data } = await useFetch<{ cards: Card[], starters: { id: string, to: string, icon: string, labelKey: string }[] }>('/api/core/home', { query: { home: props.home }, key: `core:home:${props.home}`, default: () => ({ cards: [], starters: [] }) })

// A component no one answers to is left out rather than breaking the page.
const cards = computed(() => (data.value?.cards ?? []).flatMap((c) => {
  const component = resolveComponent(c.component)
  return typeof component === 'string' ? [] : [{ ...c, component }]
}))
const bands = computed(() => (['overdue', 'today', 'info'] as const)
  .map(urgency => ({ urgency, cards: cards.value.filter(c => c.urgency === urgency) }))
  .filter(b => b.cards.length))
</script>

<template>
  <PageFrame :title="title">
    <div
      v-if="bands.length"
      class="space-y-8"
    >
      <section
        v-for="band in bands"
        :key="band.urgency"
        :aria-labelledby="`home-${band.urgency}`"
      >
        <h2
          :id="`home-${band.urgency}`"
          class="mb-3 text-sm font-semibold text-muted"
        >
          {{ t(`core.home.${band.urgency}`) }}
        </h2>
        <ul class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <li
            v-for="c in band.cards"
            :key="c.id"
            class="rounded-lg border border-default p-4"
          >
            <component
              :is="c.component"
              :count="c.count"
            />
          </li>
        </ul>
      </section>
    </div>
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
