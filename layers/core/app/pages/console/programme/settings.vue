<!-- A generated page of settings (settings build brief): every setting whose group is placed on
     core.programme. The interface build gives these pages their final form. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
</script>

<template>
  <PageSettings
    page="core.programme"
    :title="t('core.settings-pages.programme')"
    :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
  />
</template>
