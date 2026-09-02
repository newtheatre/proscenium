<script setup lang="ts">
// Calm intensity: the Nuxt UI defaults on our tokens and nothing from the expressive kit. A
// member on the box office computer at 19:15 does not want personality.
const links = [[
  { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: '/admin' },
  { label: 'People', icon: 'i-lucide-users', to: '/admin/people' },
  { label: 'Members', icon: 'i-lucide-badge-check', to: '/admin/members' },
  { label: 'Fellows', icon: 'i-lucide-award', to: '/admin/fellows' },
  { label: 'Rooms', icon: 'i-lucide-door-open', to: '/admin/rooms' },
  { label: 'Room requests', icon: 'i-lucide-inbox', to: '/admin/requests' },
  { label: 'Other rooms', icon: 'i-lucide-map-pin', to: '/admin/other-rooms' },
  { label: 'Closures', icon: 'i-lucide-construction', to: '/admin/blackouts' },
  { label: 'Utilisation', icon: 'i-lucide-chart-column', to: '/admin/utilisation' },
  { label: 'Training', icon: 'i-lucide-graduation-cap', to: '/admin/training' },
  { label: 'Departments', icon: 'i-lucide-building-2', to: '/admin/departments' },
  { label: 'Training records', icon: 'i-lucide-clipboard-check', to: '/admin/training-records' },
  { label: 'Training sessions', icon: 'i-lucide-calendar-days', to: '/admin/training-sessions' },
  { label: 'Recalculation', icon: 'i-lucide-calendar-sync', to: '/admin/training-recalculation' },
  { label: 'Audit trail', icon: 'i-lucide-scroll-text', to: '/admin/audit' },
  { label: 'Settings', icon: 'i-lucide-settings', to: '/admin/config' },
], // Development only, and absent from a build because the page it points at is (K-124).
...import.meta.dev
  ? [[{ label: 'Developer tools', icon: 'i-lucide-flask-conical', to: '/dev' }]]
  : []]
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
        <AuthStatus stacked />
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
