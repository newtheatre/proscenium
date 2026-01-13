<template>
  <UDashboardGroup>
    <UDashboardSidebar
      resizable
      collapsible
    />

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar :title="route.meta.title as string || 'Admin'">
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

<script setup lang="ts">
const route = useRoute()
</script>
