<!-- Sign-in settings (identity spec part 6, Site administration): the ways in, managed domains,
     session times and recovery, drawn from the settings registry. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <PageSettings
    scope="site"
    :title="t('core.sign-in-settings.title')"
    :only="['core.sign-in.', 'core.sessions.', 'core.recovery.']"
  />
</template>
