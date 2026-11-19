<!-- The Admin shell (R-33): the console's frame, with an "Admin" mark at the start of every page's
     navbar so it says where you are at every width, the theatre's mark where it is in the console and
     "Back to console" at the foot of the sidebar, the brand's colours as in every shell (C-35), and no
     Tonight or work queue. Below 1024 pixels the sidebar is a drawer, opened from the navbar's one menu button. -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useT()
const route = useRoute()
const { data: brandData } = await useBrand()
const brand = computed(() => ({ name: brandData.value?.name ?? t('core.public.default-name') }))
const { data: navigation } = await useNavigation('admin')
const open = ref(false)
provide(DASHBOARD_SHELL, true)
provide(ADMIN_SHELL, true)
// A module's page (/admin/modules/<module>/...) frames whichever of its tabs is open.
const module = computed(() => /^\/admin\/modules\/([a-z][a-z0-9-]*)(?:\/|$)/.exec(route.path)?.[1])
// Sign-in's pages are tabs of one frame, as a module's are.
const signIn = computed(() => /^\/admin\/sign-in(?:\/|$)/.test(route.path))
watch(() => route.fullPath, () => { open.value = false })

// The browser title is the one pattern every page follows, the page, then the area, then the theatre
// ("Branding · Admin · Nottingham New Theatre").
useHead({
  titleTemplate: (title) => {
    const area = t('core.admin.title')
    return [title && title !== area ? title : null, area, brand.value.name].filter(Boolean).join(' · ')
  },
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
          class="flex min-w-0 items-center font-semibold"
        >
          <BrandMark
            v-if="!collapsed"
            size="sm"
          />
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

    <!-- Each page renders its own panel (PageFrame), whose navbar carries the Admin mark. -->
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
      <SignInFrame v-else-if="signIn">
        <slot />
      </SignInFrame>
      <slot v-else />
    </main>
  </UDashboardGroup>
</template>
