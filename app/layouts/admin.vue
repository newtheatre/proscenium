<template>
  <UDashboardGroup>
    <UDashboardSidebar
      resizable
      collapsible
      :min-size="12"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2">
          <ULink
            to="/"
          >
            <UColorModeImage
              v-if="!collapsed"
              light="/images/logos/anniversary-grey.png"
              dark="/images/logos/anniversary-white.png"
              alt="Nottingham New Theatre Logo"
              height="100"
            />
            <UIcon
              v-else
              name="i-heroicons-squares-2x2"
              class="size-8 text-primary mx-auto"
            />
          </ULink>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navigation"
          orientation="vertical"
        />
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar :title="route.meta.title as string || 'Admin'">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <UColorModeButton />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>

<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()

const navigation: NavigationMenuItem[][] = [
  [
    {
      label: 'Dashboard',
      icon: 'i-lucide-layout-dashboard',
      to: '/admin',
    },
    {
      label: 'Users',
      icon: 'i-lucide-users',
      to: '/admin/users',
    },
      {
        label: 'Venues',
        icon: 'i-lucide-building',
        to: '/admin/venues',
      },
      {
        label: 'Ticket Types',
        icon: 'i-lucide-ticket',
        to: '/admin/ticket-types',
      },
      {
        label: 'Shows',
        icon: 'i-lucide-calendar',
        to: '/admin/shows',
      },
  ],
]
</script>
