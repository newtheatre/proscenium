<script setup lang="ts">
// The house image for any shared link; a page with a picture of its own overrides it (K-126).
useSeoMeta({
  ogImage: '/og-default.png',
  twitterCard: 'summary_large_image',
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
