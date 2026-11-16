<!-- A settings page with no page code: one per module that declares settings (UI-14). -->
<script setup lang="ts">
const { t, te } = useT()
const route = useRoute()
// Core's own page answers at /console/system/settings (the System group); every other module's is at /console/<module>/settings.
const module = computed(() => route.params.module === 'system' ? 'core' : String(route.params.module))
const title = computed(() => te(`${module.value}.module.name`) ? t('core.settings-page.title', { module: t(`${module.value}.module.name`) }) : t('core.settings-page.title', { module: module.value }))
</script>

<template>
  <PageSettings
    :key="module"
    :module="module"
    :title="title"
    :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
  />
</template>
