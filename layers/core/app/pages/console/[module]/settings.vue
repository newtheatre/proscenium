<!-- A settings page with no page code: one per module that declares settings (UI-14). -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })
const { t, te } = useT()
const route = useRoute()
const module = computed(() => String(route.params.module))
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
