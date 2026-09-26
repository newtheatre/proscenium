<script setup lang="ts">
import { can } from '#shared/utils/abilities'
import { SIDEBAR_DEFAULT_SIZE, SIDEBAR_MAX_SIZE, openOnArrival, sidebarParts, visibleGroups } from '#shared/utils/console-sidebar'
import { CONSOLE_HOME, groupFor, navCount } from '#shared/utils/site-nav'
import type { NavEntry, NavSection } from '#shared/utils/site-nav'
import type { NavigationMenuItem } from '@nuxt/ui'

// Calm intensity: the Nuxt UI defaults on our tokens and nothing from the expressive kit. A
// member on the box office computer at 19:15 does not want personality.
const route = useRoute()
const viewer = useViewer()

const home = computed(() => can(viewer.value, CONSOLE_HOME.ability))

const groups = computed(() => visibleGroups(viewer.value))

// A waiting queue is counted on its entry and on its group, so a closed group still says so.
const { counts, refresh } = useNavCounts()
onMounted(refresh)
watch(() => route.path, refresh)

const badge = (count: number): NavigationMenuItem['badge'] =>
  count > 0 ? { label: String(count), color: 'warning', variant: 'subtle', size: 'sm' } : undefined

const link = (entry: NavEntry): NavigationMenuItem => ({
  label: entry.label,
  icon: entry.icon,
  to: entry.to,
  exact: entry.exact,
  badge: badge(navCount([entry], counts.value)),
})

// A group opens when the route lands in it and stays open until the officer closes it, so moving
// between Box office and Bar does not re-expand on every switch (0082).
const opened = ref<string[]>([])

watch(() => route.path, (path) => {
  const key = groupFor(path)?.key
  if (key && !opened.value.includes(key)) opened.value = [...opened.value, key]
}, { immediate: true })

// A viewer with one group to choose finds it open, whatever screen they land on (0105).
watch(groups, (visible) => {
  const lone = openOnArrival(visible).filter(key => !opened.value.includes(key))
  if (lone.length) opened.value = [...opened.value, ...lone]
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
  // A group of one is drawn as its entry, in the group's place (0105).
  const rest: NavigationMenuItem[] = sidebarParts(groups.value).map(part => part.kind === 'entry'
    ? link(part.entry)
    : {
        label: part.group.label,
        icon: part.group.icon,
        value: part.group.key,
        badge: badge(navCount(part.group.items, counts.value)),
        children: withSections(part.group.items, collapsed),
      })
  const dev: NavigationMenuItem[] = import.meta.dev
    // Development only, and absent from a build because the page it points at is (K-124).
    ? [{ label: 'Developer tools', icon: 'i-lucide-flask-conical', to: '/dev' }]
    : []
  return [[...first, ...rest], ...(dev.length ? [dev] : [])]
}
</script>

<template>
  <UDashboardGroup>
    <!-- A named id keys the width's cookie, so a browser that held the old width starts once at
         the new default (0105). -->
    <UDashboardSidebar
      id="console"
      collapsible
      resizable
      :default-size="SIDEBAR_DEFAULT_SIZE"
      :max-size="SIDEBAR_MAX_SIZE"
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
            <FeedbackButton shell="console" />
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
