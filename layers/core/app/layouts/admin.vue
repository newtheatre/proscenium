<!-- The Admin shell (R-33): the console's frame with a strip above the page header
     that says where you are at every width, the theatre's mark where it is in the console and "Back to console" at the foot of the sidebar,
     neutral buttons (no brand colour), and no Tonight or work queue. Below 1024 pixels the sidebar
     is a drawer, opened from the strip. -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useT()
const route = useRoute()
const { data: brandData } = await useBrand()
const brand = computed(() => ({ name: brandData.value?.name ?? t('core.public.default-name') }))
const { data: navigation } = await useNavigation('admin')
const open = ref(false)
provide(DASHBOARD_SHELL, true)
// A module's page (/admin/modules/<module>/...) frames whichever of its tabs is open.
const module = computed(() => /^\/admin\/modules\/([a-z][a-z0-9-]*)(?:\/|$)/.exec(route.path)?.[1])
watch(() => route.fullPath, () => { open.value = false })

// The browser title starts with where you are, and the buttons stay neutral (see main.css).
useHead({
  titleTemplate: title => (title ? `${t('core.admin.title')}: ${title}` : t('core.admin.title')),
  bodyAttrs: { class: 'admin-shell' },
})

const groups = computed<NavigationMenuItem[]>(() => [
  { label: t('core.admin.overview'), icon: 'i-lucide-layout-dashboard', to: '/admin', active: route.path === '/admin', onSelect: () => { open.value = false } },
  ...sidebarGroups(navigation.value?.groups ?? [], { t, path: route.path, onSelect: () => { open.value = false } }),
])
</script>

<template>
  <UDashboardGroup>
    <SkipLink />
    <UDashboardSidebar
      id="admin"
      v-model:open="open"
      collapsible
      resizable
      :default-size="18"
      :min-size="14"
      :max-size="28"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/admin"
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
          :items="groups"
          orientation="vertical"
          :collapsed="collapsed"
          tooltip
          popover
          :aria-label="t('core.admin.navigation')"
        />
      </template>
      <template #footer="{ collapsed }">
        <SidebarFooter
          :collapsed="collapsed"
          admin
        />
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
        <ModuleFrame
          v-if="module"
          :key="module"
          :module="module"
        >
          <slot />
        </ModuleFrame>
        <slot v-else />
      </main>
    </div>
  </UDashboardGroup>
</template>
