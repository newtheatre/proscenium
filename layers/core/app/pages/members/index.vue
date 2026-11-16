<!-- The members' area home: a short list of where to go, from the sections modules contribute. -->
<script setup lang="ts">
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
    <ul
      v-else
      class="grid gap-3 sm:grid-cols-2"
    >
      <li
        v-for="item in navigation.items"
        :key="item.id"
      >
        <UButton
          :to="item.to"
          :icon="item.icon"
          color="neutral"
          variant="outline"
          size="xl"
          block
          class="justify-start"
          :label="t(item.label)"
        />
      </li>
    </ul>
  </PageFrame>
</template>
