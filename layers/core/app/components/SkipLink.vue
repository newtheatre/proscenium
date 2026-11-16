<!-- The first thing a keyboard reaches on every page: a way past the header to the content. -->
<script setup lang="ts">
const { t } = useT()
</script>

<template>
  <a
    href="#main"
    class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-default focus:px-4 focus:py-2 focus:text-highlighted focus:shadow-lg focus:ring-2 focus:ring-primary"
  >{{ t('core.skip-link') }}</a>
</template>
