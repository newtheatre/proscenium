<!-- Sign-in settings (identity spec part 6, Admin): the ways in, managed domains,
     session times and recovery, drawn from the settings registry as the page core.sign-in. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
</script>

<template>
  <PageSettings
    page="core.sign-in"
    :title="t('core.sign-in-settings.title')"
    :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
  />
</template>
