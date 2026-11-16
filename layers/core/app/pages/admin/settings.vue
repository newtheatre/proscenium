<!-- The site's own settings (R-33): every setting declared with scope 'site', grouped by module. -->
<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const { t } = useT()
const route = useRoute()
</script>

<template>
  <PageSettings
    scope="site"
    :title="t('core.settings-page.site-title')"
    :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
  />
</template>
