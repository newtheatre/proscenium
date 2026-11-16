<script setup lang="ts">
// Every page's title ends with the theatre's name, so a tab and the route announcer say where it is.
const { t } = useT()
const { data: brand } = await useBrand()
const site = computed(() => brand.value?.name ?? t('core.public.default-name'))
useHead({ titleTemplate: title => title && title !== site.value ? `${title} · ${site.value}` : site.value })
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />
    <!-- Reads each new page title to screen readers after a client-side navigation. -->
    <NuxtRouteAnnouncer />
    <!-- Reads what changed without a navigation, such as a list's new count after a filter. -->
    <NuxtAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
