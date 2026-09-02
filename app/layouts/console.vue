<script setup lang="ts">
import { can } from '#shared/utils/abilities'
import { CONSOLE_HOME, CONSOLE_NAV, groupFor } from '#shared/utils/site-nav'
import type { NavEntry } from '#shared/utils/site-nav'
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

// Only the group holding the current route is open, so the sidebar stays short however many
// screens the modules add (0040).
const open = computed(() => groupFor(route.path)?.key)

const items = computed<NavigationMenuItem[][]>(() => {
  const first: NavigationMenuItem[] = home.value ? [link(CONSOLE_HOME)] : []
  const rest: NavigationMenuItem[] = groups.value.map(group => ({
    label: group.label,
    icon: group.icon,
    value: group.key,
    children: group.items.map(link),
  }))
  const dev: NavigationMenuItem[] = import.meta.dev
    // Development only, and absent from a build because the page it points at is (K-124).
    ? [{ label: 'Developer tools', icon: 'i-lucide-flask-conical', to: '/dev' }]
    : []
  return [[...first, ...rest], ...(dev.length ? [dev] : [])]
})
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      collapsible
      resizable
    >
      <template #header>
        <span class="font-semibold">NNT</span>
      </template>
      <template #default="{ collapsed }">
        <!-- A closed group keeps its links in the document, hidden: the whole sidebar is then
             one thing to read, and what is filtered out is genuinely absent. -->
        <UNavigationMenu
          orientation="vertical"
          type="single"
          :unmount-on-hide="false"
          :collapsed="collapsed"
          :popover="collapsed"
          :tooltip="collapsed"
          :default-value="open"
          :items="items"
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
        </UDashboardNavbar>
      </template>
      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
