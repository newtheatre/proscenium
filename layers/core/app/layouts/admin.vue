<!-- The Site administration shell (R-33): the console's frame with a strip above the page header
     that says where you are at every width, a "Back to console" row where the theatre's mark is,
     neutral buttons (no brand colour), and no Tonight or work queue. Below 1024 pixels the sidebar
     is a drawer, opened from the strip. -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useT()
const route = useRoute()
const { has } = useViewer()
const { data: navigation } = await useNavigation('admin')
const open = ref(false)
provide(DASHBOARD_SHELL, true)
watch(() => route.fullPath, () => { open.value = false })

// The browser title starts with where you are, and the buttons stay neutral (see main.css).
useHead({
  titleTemplate: title => (title ? `${t('core.admin.title')}: ${title}` : t('core.admin.title')),
  bodyAttrs: { class: 'admin-shell' },
})

const back = computed(() => has('console')
  ? { label: t('core.admin.back-console'), to: '/console' }
  : { label: t('core.admin.back-site'), to: '/' })

function toItem(i: { id: string, label: string, to: string, icon: string, match?: string, count?: number }): NavigationMenuItem {
  return { label: t(i.label), icon: i.icon, to: i.to, active: isCurrent(i, route.path), badge: i.count, onSelect: () => { open.value = false } }
}

const groups = computed<NavigationMenuItem[][]>(() => [
  [{ label: t('core.admin.overview'), icon: 'i-lucide-layout-dashboard', to: '/admin', active: route.path === '/admin', onSelect: () => { open.value = false } }],
  ...(navigation.value?.groups ?? []).map(g => [
    { label: t(g.label), icon: g.icon, type: 'label' as const },
    ...[...g.everyday, ...g.setup].map(toItem),
  ]),
])
</script>

<template>
  <UDashboardGroup>
    <SkipLink />
    <UDashboardSidebar
      id="admin"
      v-model:open="open"
      collapsible
    >
      <template #header="{ collapsed }">
        <UButton
          :to="back.to"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          :label="collapsed ? undefined : back.label"
          :aria-label="back.label"
        />
      </template>
      <template #default="{ collapsed }">
        <UNavigationMenu
          :items="groups"
          orientation="vertical"
          :collapsed="collapsed"
          :aria-label="t('core.admin.navigation')"
        />
      </template>
      <!-- On a laptop these two sit in each page's navbar (ShellTools). -->
      <template #footer>
        <div class="flex flex-col gap-2 sm:hidden">
          <UDashboardSearchButton
            :label="t('core.palette.open')"
            color="neutral"
            variant="outline"
          />
          <AccountMenu />
        </div>
      </template>
    </UDashboardSidebar>

    <CommandPalette />

    <!-- The strip sits above every page's own panel (PageFrame); main.css takes its height off the panel's. -->
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="admin-strip flex h-9 shrink-0 items-center gap-2 border-b border-default bg-elevated px-4 text-sm font-medium">
        <UDashboardSidebarToggle
          class="lg:hidden"
          :aria-label="t('core.admin.menu')"
        />
        <UIcon
          name="i-lucide-shield-check"
          class="size-4"
        />
        <span>{{ t('core.admin.strip') }}</span>
      </div>
      <main
        id="main"
        tabindex="-1"
        class="admin-main flex min-w-0 flex-1 outline-none *:min-w-0 *:flex-1"
      >
        <slot />
      </main>
    </div>
  </UDashboardGroup>
</template>
