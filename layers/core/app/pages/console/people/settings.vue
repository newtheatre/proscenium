<!-- A generated page of settings (settings build brief): every setting whose group is placed on
     core.people. The interface build gives these pages their final form. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
</script>

<template>
  <PageSettings
    page="core.people"
    :title="t('core.settings-pages.people')"
    :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
  />
</template>
