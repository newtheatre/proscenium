<!-- The console shell (UI-04): a collapsible sidebar with one group per module in a fixed order,
     each split into everyday work and set-up; a group with nothing the viewer may open is absent,
     not greyed. On a phone the sidebar becomes a drawer. -->
<script setup lang="ts">
import { moduleTabOf, resolveEntry, shellOf } from '../../shared/navigation'

const { t } = useT()
const route = useRoute()
const { data: brandData } = await useBrand()
const brand = computed(() => ({ name: brandData.value?.name ?? t('core.public.default-name') }))
const { data: navigation } = await useNavigation('console')
const open = ref(false)
provide(DASHBOARD_SHELL, true)
watch(() => route.fullPath, () => { open.value = false })

// The page's navigation entry: the cog at the end of its navbar opens the settings that belong there.
const current = computed(() => resolveEntry((navigation.value?.groups ?? []).flatMap(g => [...g.everyday, ...g.setup]), route.path)?.id)
const { tabs: settingsTabs, name: settingsName } = useModuleSettings(() => current.value)
provide(CONSOLE_SETTINGS, computed(() => settingsTabs.value.length && current.value ? { scope: current.value, name: settingsName.value } : undefined))

// From the console, a module's screens in Admin open in the settings window, and a screen in the
// window that changes its own address (a list's filters) changes the window's ?screen instead.
const router = useRouter()
const windowless = (query: Record<string, unknown>) => {
  const { settings: _, screen: __, setting: ___, ...rest } = query
  return rest as Record<string, string>
}
const stop = router.beforeEach((to, from) => {
  if (shellOf(from.path) !== 'console') return
  const module = moduleTabOf({ menu: 'admin', to: to.path })
  // A screen opened from inside the window keeps the window's tabs; one opened from a page brings its module's.
  if (module) return { path: from.path, query: { ...windowless(from.query), settings: typeof from.query.settings === 'string' ? from.query.settings : module, screen: to.fullPath } }
  const settings = from.query.settings
  if (typeof settings !== 'string' || to.path !== from.path || to.query.settings !== undefined || isClosingModuleWindow()) return
  const base = (typeof from.query.screen === 'string' ? from.query.screen : '').split('?')[0]
  if (!base) return
  const query = new URLSearchParams(Object.entries(to.query).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).filter(x => x != null).map(x => [k, String(x)])))
  return { path: from.path, query: { ...windowless(from.query), settings, screen: query.size ? `${base}?${query}` : base } }
})
onBeforeUnmount(stop)

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
    <ModuleSettingsWindow />

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
