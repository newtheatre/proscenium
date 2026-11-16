<!-- My account (UI-02, UI-03): the same page for everyone signed in. Modules add sections through
     `core.account-section`: a section is a component the module supplies, shown only to those who
     hold its ability and, with hideEmpty, only while it has something to show. A module that is off
     leaves nothing behind. Identity draws its own sections (details, sign-in, sessions) the same way. -->
<script setup lang="ts">
const { t } = useT()
const { data } = await useFetch<{ sections: { id: string, component: string, to?: string, icon?: string, count?: number }[] }>('/api/core/account-sections', { query: { side: 'audience' }, key: 'core:account-sections', default: () => ({ sections: [] }) })
const { data: navigation } = await useNavigation('account')

// A name that no component answers to is left out rather than breaking the page.
const sections = computed(() => data.value.sections.flatMap((s) => {
  const component = resolveComponent(s.component)
  return typeof component === 'string' ? [] : [{ ...s, component }]
}))
</script>

<template>
  <PageFrame :title="t('core.account.title')">
    <UPageGrid v-if="navigation?.items.length">
      <UPageCard
        v-for="item in navigation.items"
        :key="item.id"
        :to="item.to"
        :icon="item.icon"
        :title="t(item.label)"
      />
    </UPageGrid>
    <div class="space-y-8">
      <section
        v-for="s in sections"
        :key="s.id"
        :aria-labelledby="`account-${s.id}`"
      >
        <component
          :is="s.component"
          :heading-id="`account-${s.id}`"
        />
      </section>
    </div>
    <EmptyState
      v-if="!sections.length && !navigation?.items.length"
      :title="t('core.account.empty')"
      :description="t('core.account.empty-description')"
    />
  </PageFrame>
</template>
