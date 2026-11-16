<!-- Console home (UI-16): a queue of what is waiting, from modules' home cards. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <PageHome
    :title="t('core.console.home.title')"
    home="console"
  />
</template>
