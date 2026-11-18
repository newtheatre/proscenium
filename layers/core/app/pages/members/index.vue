<!-- The members' area home: cards modules put on it (core.home-card with home 'members'), such as
     the holder's membership card, then a short list of where to go, from the sections modules
     contribute. -->
<script setup lang="ts">
const { t } = useT()
const { viewer } = useViewer()
const { data: navigation } = await useNavigation('members')
const title = computed(() => viewer.value.membersName ?? t('core.menu.members'))

interface Card { id: string, component: string, count?: number }
const { data: home } = await useAPI<{ cards: Card[] }>('/api/core/home', { query: { home: 'members' }, key: 'core:home:members', default: () => ({ cards: [] }) })
// A section says how it stands in a line where the catalogue has one: core.members.line.<entry id>
// with the count ("2 unread"), or core.members.line-none.<entry id> while the count is nought.
const { te } = useT()
function describe(item: { id: string, count?: number }): string | undefined {
  if (item.count && te(`core.members.line.${item.id}`)) return t(`core.members.line.${item.id}`, { count: item.count })
  if (!item.count && te(`core.members.line-none.${item.id}`)) return t(`core.members.line-none.${item.id}`)
  return undefined
}
// A component no one answers to is left out rather than breaking the page.
const cards = computed(() => (home.value?.cards ?? []).flatMap((c) => {
  const component = resolveComponent(c.component)
  return typeof component === 'string' ? [] : [{ ...c, component }]
}))
</script>

<template>
  <PageFrame :title="title">
    <div class="space-y-6">
      <ul
        v-if="cards.length"
        class="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
        <li
          v-for="c in cards"
          :key="c.id"
          class="rounded-lg border border-default p-4"
        >
          <component
            :is="c.component"
            :count="c.count"
          />
        </li>
      </ul>
      <EmptyState
        v-if="!navigation?.items.length && !cards.length"
        :title="t('core.members.nothing')"
        :description="t('core.members.nothing-description')"
      />
      <UPageGrid v-else-if="navigation?.items.length">
        <UPageCard
          v-for="item in navigation.items"
          :key="item.id"
          :to="item.to"
          :icon="item.icon"
          :title="t(item.label)"
          :description="describe(item)"
        />
      </UPageGrid>
    </div>
  </PageFrame>
</template>
