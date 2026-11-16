<!-- What every console page's navbar ends with: the search button, which opens the command
     palette the layout holds, and the account menu, the one way between shells (UI-02). On a phone
     the navbar has room only for the title and the page's own action, so both move to the drawer. -->
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
    <AccountMenu />
  </div>
</template>
