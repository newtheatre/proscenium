<script setup lang="ts">
import { can } from '#shared/utils/abilities'
import { CONSOLE_HOME, CONSOLE_NAV, groupFor } from '#shared/utils/site-nav'
import type { NavEntry, NavSection } from '#shared/utils/site-nav'
import type { NavigationMenuItem } from '@nuxt/ui'

// Calm intensity: the Nuxt UI defaults on our tokens and nothing from the expressive kit. A
// member on the box office computer at 19:15 does not want personality.
const route = useRoute()
const viewer = useViewer()

const home = computed(() => can(viewer.value, CONSOLE_HOME.ability))

// A group with nothing in it is not rendered: the empty ones are where the modules land.
const groups = computed(() => CONSOLE_NAV
  .map(group => ({ ...group, items: group.items.filter(entry => can(viewer.value, entry.ability)) }))
  .filter(group => group.items.length > 0))

const link = (entry: NavEntry): NavigationMenuItem => ({
  label: entry.label,
  icon: entry.icon,
  to: entry.to,
  exact: entry.exact,
})

// A group opens when the route lands in it and stays open until the officer closes it, so moving
// between Box office and Bar does not re-expand on every switch (0082).
const opened = ref<string[]>([])

watch(() => route.path, (path) => {
  const key = groupFor(path)?.key
  if (key && !opened.value.includes(key)) opened.value = [...opened.value, key]
}, { immediate: true })

// Muted section headings, and none when the sidebar is collapsed: a collapsed group opens as a
// popover, which draws every child as a link and so has nowhere to put a heading (0082).
function withSections(items: NavEntry[], collapsed: boolean): NavigationMenuItem[] {
  const drawn: NavigationMenuItem[] = []
  let section: NavSection | undefined
  for (const entry of items) {
    if (!collapsed && entry.section && entry.section !== section) drawn.push({ label: entry.section, type: 'label' })
    section = entry.section
    drawn.push(link(entry))
  }
  return drawn
}

function items(collapsed: boolean): NavigationMenuItem[][] {
  const first: NavigationMenuItem[] = home.value ? [link(CONSOLE_HOME)] : []
  const rest: NavigationMenuItem[] = groups.value.map(group => ({
    label: group.label,
    icon: group.icon,
    value: group.key,
    children: withSections(group.items, collapsed),
  }))
  const dev: NavigationMenuItem[] = import.meta.dev
    // Development only, and absent from a build because the page it points at is (K-124).
    ? [{ label: 'Developer tools', icon: 'i-lucide-flask-conical', to: '/dev' }]
    : []
  return [[...first, ...rest], ...(dev.length ? [dev] : [])]
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      collapsible
      resizable
    >
      <template #header>
        <NuxtLink
          to="/admin"
          class="font-semibold"
        >
          NNT
        </NuxtLink>
      </template>
      <template #default="{ collapsed }">
        <!-- unmount-on-hide keeps a closed group's accordion trigger ids from colliding with an
             open one's (issue 896): Reka does not scope them per instance while both stay mounted. -->
        <UNavigationMenu
          v-model="opened"
          orientation="vertical"
          type="multiple"
          :collapsed="collapsed"
          :popover="collapsed"
          :tooltip="collapsed"
          :items="items(collapsed)"
        />
      </template>
      <template #footer>
        <AuthStatus stacked />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar :title="(route.meta.title as string) ?? 'Console'">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <DocsLink />
          </template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
