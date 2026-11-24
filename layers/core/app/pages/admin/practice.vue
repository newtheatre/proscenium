<!-- Admin > Practice (PM-S9, PM-18): a generated page of settings, every setting whose group is placed
     on core.practice: practice on or off, the idle limit, the scenarios switched off, and whether
     stores copy the theatre's configuration. Each change is audited in the real database. -->
<script setup lang="ts">
const { t } = useT()
const route = useRoute()
</script>

<template>
  <PageSettings
    page="core.practice"
    :title="t('core.settings-pages.practice')"
    :highlight="typeof route.query.setting === 'string' ? route.query.setting : undefined"
  />
</template>
