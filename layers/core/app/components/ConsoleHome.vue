<!-- The console home (UI-16): what needs the person first, and only when something does; then the
     quick actions they may use; then a grid of headline figures from the modules that are on. The
     empty state shows only when the page would otherwise be blank. -->
<script setup lang="ts">
import type { HomeCard } from './HomeCards.vue'
import type { ShownFigure } from './HomeFigureTile.vue'

defineProps<{ title: string }>()
const { t } = useT()
interface Home { cards: HomeCard[], actions: { id: string, to: string, icon: string, labelKey: string }[], figures: ShownFigure[] }
const { data } = await useAPI<Home>('/api/core/home', { query: { home: 'console' }, key: 'core:home:console', default: () => ({ cards: [], actions: [], figures: [] }) })
const cards = computed(() => data.value?.cards ?? [])
const actions = computed(() => data.value?.actions ?? [])
const figures = computed(() => data.value?.figures ?? [])
const nothing = computed(() => !cards.value.length && !actions.value.length && !figures.value.length)
</script>

<template>
  <PageFrame
    :title="title"
    width="full"
  >
    <div class="space-y-8">
      <HomeCards
        v-if="cards.length"
        :cards="cards"
      />

      <nav
        v-if="actions.length"
        :aria-label="t('core.console.home.actions')"
        class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
      >
        <UButton
          v-for="a in actions"
          :key="a.id"
          :to="a.to"
          :icon="a.icon"
          :label="t(a.labelKey)"
          color="neutral"
          variant="outline"
          size="lg"
          class="justify-center sm:justify-start"
          :ui="{ label: 'max-sm:whitespace-normal max-sm:text-start' }"
        />
      </nav>

      <section
        v-if="figures.length"
        aria-labelledby="home-figures"
      >
        <h2
          id="home-figures"
          class="sr-only"
        >
          {{ t('core.console.home.figures') }}
        </h2>
        <div class="grid grid-flow-row-dense grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <HomeFigureTile
            v-for="f in figures"
            :key="f.id"
            :figure="f"
          />
        </div>
      </section>

      <EmptyState
        v-if="nothing"
        :title="t('core.console.home.empty.title')"
        :description="t('core.console.home.empty.description')"
        icon="i-lucide-circle-check"
      />
    </div>
  </PageFrame>
</template>
