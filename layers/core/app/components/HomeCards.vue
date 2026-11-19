<!-- A home page's queue (UI-16): modules' cards in bands, overdue, then today, then information. The
     page draws nothing here when nothing is waiting. -->
<script setup lang="ts">
export interface HomeCard { id: string, component: string, urgency: 'overdue' | 'today' | 'info', count?: number }

const props = defineProps<{ cards: HomeCard[] }>()
const { t } = useT()

// A component no one answers to is left out rather than breaking the page.
const resolved = computed(() => props.cards.flatMap((c) => {
  const component = resolveComponent(c.component)
  if (typeof component !== 'string') return [{ ...c, component }]
  // A card a module names but no `app/home-cards` file answers to would otherwise vanish without a trace.
  if (import.meta.dev) console.warn(`[home] The card "${c.id}" names the component "${c.component}", which is not registered. Put it in a layer's app/home-cards folder.`)
  return []
}))
const bands = computed(() => (['overdue', 'today', 'info'] as const)
  .map(urgency => ({ urgency, cards: resolved.value.filter(c => c.urgency === urgency) }))
  .filter(b => b.cards.length))
</script>

<template>
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
</template>
