<!-- The Tonight hub: the live screens this person may open, one large tile each. The tiles are the
     live menu's entries (core.navigation with menu 'live'), so a module that brings live screens
     adds its own tile and nothing here names a module. -->
<script setup lang="ts">
const { t } = useT()
const { data: navigation } = await useNavigation('live')
const tiles = computed(() => navigation.value?.items ?? [])
</script>

<template>
  <PageLive :title="t('core.live.title')">
    <ul
      v-if="tiles.length"
      class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <li
        v-for="tile in tiles"
        :key="tile.id"
      >
        <UButton
          :to="tile.to"
          :icon="tile.icon"
          :label="t(tile.label)"
          color="neutral"
          variant="outline"
          size="xl"
          block
          class="min-h-24 justify-start text-lg"
        >
          <template
            v-if="tile.count"
            #trailing
          >
            <UBadge
              :label="String(tile.count)"
              size="lg"
              class="ms-auto"
            />
          </template>
        </UButton>
      </li>
    </ul>
    <EmptyState
      v-else
      icon="i-lucide-moon"
      :title="t('core.live.empty.title')"
      :description="t('core.live.empty.description')"
    />
  </PageLive>
</template>
