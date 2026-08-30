<script setup lang="ts">
// Calm intensity: the Nuxt UI defaults on our tokens and nothing from the expressive kit. A
// member on the box office computer at 19:15 does not want personality.
const links = [[
  { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: '/admin' },
  { label: 'People', icon: 'i-lucide-users', to: '/admin/people' },
  { label: 'Audit trail', icon: 'i-lucide-scroll-text', to: '/admin/audit' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/admin/config' },
]]
const route = useRoute()
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      collapsible
      resizable
    >
      <template #header>
        <span class="font-semibold">NNT admin</span>
      </template>
      <UNavigationMenu
        orientation="vertical"
        :items="links"
      />
      <template #footer>
        <AuthStatus />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar :title="(route.meta.title as string) ?? 'Admin'">
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
