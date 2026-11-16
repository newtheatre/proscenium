<!-- The frame every members' and console screen shares: one title (also the tab's title and the
     first heading), the page's one primary action, and one of three named content widths.

     In the console (and any shell built on Nuxt UI's dashboard) the page owns its panel: the title
     and primary action sit in the panel's navbar and stay put as the page scrolls, `toolbar` is the
     bar under it (a list's filters) and `footer` the bar at the foot (a form's buttons). In the
     public and members' shells the same slots sit in the page itself. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  /** reading (forms, settings), standard (lists, records) or full (calendars, seating plans). */
  width?: 'reading' | 'standard' | 'full'
  description?: string
}>(), { width: 'standard', description: undefined })

defineSlots<{
  default?: () => unknown
  /** Beside the title: the record's status. */
  status?: () => unknown
  /** One primary action per view. A second competing button is a sign the page does two jobs. */
  primary?: () => unknown
  toolbar?: () => unknown
  footer?: () => unknown
}>()

useHead({ title: () => props.title })
const dashboard = inject(DASHBOARD_SHELL, false)
const widths = { reading: 'width-reading', standard: 'width-standard', full: 'width-full' } as const
</script>

<template>
  <UDashboardPanel
    v-if="dashboard"
    :ui="{ root: 'h-svh' }"
  >
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <slot name="status" />
        </template>
        <template #right>
          <slot name="primary" />
          <ShellTools />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar v-if="$slots.toolbar">
        <template #left>
          <slot name="toolbar" />
        </template>
      </UDashboardToolbar>
    </template>
    <template #body>
      <div
        class="space-y-4"
        :class="widths[width]"
      >
        <p
          v-if="description"
          class="text-sm text-muted"
        >
          {{ description }}
        </p>
        <slot />
      </div>
    </template>
    <template
      v-if="$slots.footer"
      #footer
    >
      <div class="flex shrink-0 justify-end gap-2 border-t border-default px-4 py-3 sm:px-6">
        <slot name="footer" />
      </div>
    </template>
  </UDashboardPanel>

  <UContainer v-else>
    <div :class="widths[width]">
      <UPageHeader
        :title="title"
        :description="description"
      >
        <template #links>
          <slot name="primary" />
        </template>
        <slot name="status" />
      </UPageHeader>
      <div class="space-y-4 py-6">
        <slot name="toolbar" />
        <slot />
        <div
          v-if="$slots.footer"
          class="sticky bottom-0 flex justify-end gap-2 border-t border-default bg-default py-3"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </UContainer>
</template>
