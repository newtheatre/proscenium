<!-- Site administration's Overview (R-33): a queue of what needs attention at the site level, from
     home cards with home 'admin' (needs attention first, then state). -->
<script setup lang="ts">
definePageMeta({ layout: 'admin' })
const { t } = useT()
</script>

<template>
  <PageHome
    :title="t('core.admin.home.title')"
    home="admin"
    empty-title="core.admin.home.empty.title"
    empty-description="core.admin.home.empty.description"
  />
</template>
