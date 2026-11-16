<!-- The console shell (UI-04): a collapsible sidebar with one group per module in a fixed order,
     each split into everyday work and set-up; a group with nothing the viewer may open is absent,
     not greyed. On a phone the sidebar becomes a drawer. -->
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useT()
const route = useRoute()
const { data: brandData } = await useBrand()
const brand = computed(() => ({ name: brandData.value?.name ?? t('core.public.default-name') }))
const { data: navigation } = await useNavigation('console')
const open = ref(false)
provide(DASHBOARD_SHELL, true)
watch(() => route.fullPath, () => { open.value = false })

function toItem(i: { id: string, label: string, to: string, icon: string, match?: string, count?: number }): NavigationMenuItem {
  return { label: t(i.label), icon: i.icon, to: i.to, active: isCurrent(i, route.path), badge: i.count, onSelect: () => { open.value = false } }
}

// One menu for the whole sidebar: each module's group is a list of its own, headed by the group's
// name, then its everyday entries and its set-up entries.
const groups = computed<NavigationMenuItem[][]>(() => (navigation.value?.groups ?? []).map((g) => {
  const items: NavigationMenuItem[] = [{ label: t(g.label), icon: g.icon, type: 'label' }]
  if (g.everyday.length) items.push({ label: t('core.console.everyday'), type: 'label' }, ...g.everyday.map(toItem))
  if (g.setup.length) items.push({ label: t('core.console.setup'), type: 'label' }, ...g.setup.map(toItem))
  return items
}))
</script>

<template>
  <UDashboardGroup>
    <SkipLink />
    <UDashboardSidebar
      id="console"
      v-model:open="open"
      collapsible
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
          :items="groups"
          orientation="vertical"
          :collapsed="collapsed"
          :aria-label="t('core.console.navigation')"
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
