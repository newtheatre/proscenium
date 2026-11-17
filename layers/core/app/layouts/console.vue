<!-- The console shell (UI-04): a collapsible sidebar with one group per module in a fixed order,
     each split into everyday work and set-up; a group with nothing the viewer may open is absent,
     not greyed. On a phone the sidebar becomes a drawer. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
const { data: brandData } = await useBrand()
const brand = computed(() => ({ name: brandData.value?.name ?? t('core.public.default-name') }))
const { data: navigation } = await useNavigation('console')
const open = ref(false)
provide(DASHBOARD_SHELL, true)
watch(() => route.fullPath, () => { open.value = false })

// One menu for the whole sidebar: a collapsible section for each module's group.
const items = computed(() => sidebarGroups(navigation.value?.groups ?? [], { t, path: route.path, onSelect: () => { open.value = false } }))
</script>

<template>
  <UDashboardGroup>
    <SkipLink />
    <UDashboardSidebar
      id="console"
      v-model:open="open"
      collapsible
      resizable
      :default-size="18"
      :min-size="14"
      :max-size="28"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/console"
          class="truncate font-semibold"
        >
          <span v-if="!collapsed">{{ brand.name }}</span>
          <UIcon
            v-else
            name="i-lucide-drama"
            class="size-5"
          />
        </NuxtLink>
      </template>
      <template #default="{ collapsed }">
        <UNavigationMenu
          :items="items"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
          popover
          :aria-label="t('core.console.navigation')"
        />
      </template>
      <template #footer="{ collapsed }">
        <SidebarFooter :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <CommandPalette />

    <!-- Each page renders its own panel (PageFrame); tabindex lets the skip link focus the page. -->
    <main
      id="main"
      tabindex="-1"
      class="flex min-w-0 flex-1 outline-none *:min-w-0 *:flex-1"
    >
      <slot />
    </main>
  </UDashboardGroup>
</template>
