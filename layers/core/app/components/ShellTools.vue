<!-- What every console page's navbar ends with: the cog for the module's settings, when there are any
     the viewer may change, then the search button, which opens the command palette the
     layout holds. The account menu is at the foot of the sidebar. On a phone the navbar has room only
     for the title and the page's own action, so search moves to the drawer. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
// In the console, a cog opens the settings that belong to the page, for whoever may change them.
const settings = inject(CONSOLE_SETTINGS, undefined)
</script>

<template>
  <div class="flex items-center gap-1.5">
    <IconButton
      v-if="settings"
      icon="i-lucide-settings"
      :label="t('core.modules.window.title', { module: t(settings.name) })"
      :to="{ query: { ...route.query, settings: settings.scope } }"
    />
    <UDashboardSearchButton
      :label="t('core.palette.open')"
      color="neutral"
      variant="outline"
      class="max-sm:hidden"
    />
  </div>
</template>
