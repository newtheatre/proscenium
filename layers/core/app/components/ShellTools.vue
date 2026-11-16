<!-- What every console page's navbar ends with: the search button, which opens the command palette the
     layout holds. The account menu is at the foot of the sidebar. On a phone the navbar has room only
     for the title and the page's own action, so search moves to the drawer. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <div class="flex items-center gap-1.5 max-sm:hidden">
    <UDashboardSearchButton
      :label="t('core.palette.open')"
      color="neutral"
      variant="outline"
    />
  </div>
</template>
