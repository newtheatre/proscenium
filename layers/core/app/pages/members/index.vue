<!-- The members' area home: a short list of where to go, from the sections modules contribute. -->
<script setup lang="ts">
definePageMeta({ layout: 'members' })
const { t } = useT()
const { viewer } = useViewer()
const { data: navigation } = await useNavigation('members')
const title = computed(() => viewer.value.membersName ?? t('core.menu.members'))
</script>

<template>
  <PageFrame :title="title">
    <EmptyState
      v-if="!navigation?.items.length"
      :title="t('core.members.nothing')"
      :description="t('core.members.nothing-description')"
    />
    <UPageGrid v-else>
      <UPageCard
        v-for="item in navigation.items"
        :key="item.id"
        :to="item.to"
        :icon="item.icon"
        :title="t(item.label)"
      />
    </UPageGrid>
  </PageFrame>
</template>
