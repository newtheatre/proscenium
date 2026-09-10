<script setup lang="ts">
import { DEFAULT_OG_IMAGE } from '#shared/utils/seo'

// The house image for any shared link; a page with a picture of its own overrides it (K-125).
useSeoMeta({
  ogImage: DEFAULT_OG_IMAGE,
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
