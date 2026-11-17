<!-- A generated page of settings (settings build brief): every setting whose group is placed on
     core.privacy. The interface build gives these pages their final form. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
</script>

<template>
  <PageSettings
    page="core.privacy"
    :title="t('core.settings-pages.privacy')"
    :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
  />
</template>
