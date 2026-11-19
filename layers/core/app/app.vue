<script setup lang="ts">
// Every page's title ends with the theatre's name, so a tab and the route announcer say where it is.
const { t } = useT()
const { data: brand } = await useBrand()
const site = computed(() => brand.value?.name ?? t('core.public.default-name'))
// Nuxt UI's own words and its date and time controls follow the theatre's language.
const locale = useUiLocale()
// In live mode the foot of the screen holds the actions that matter most (report an incident, the
// emergency card), so a toast comes in at the top, one at a time, and goes sooner.
const route = useRoute()
const toaster = computed(() => route.path === '/live' || route.path.startsWith('/live/') ? { position: 'top-center' as const, max: 1, duration: 3000 } : {}) // not-policy: how long a live toast stays
// The brand's tokens go into the head of every page in every shell, live mode included, so no
// stylesheet request holds up the first paint and a saved brand shows on the next page load.
useHead(() => ({ style: brand.value?.css ? [{ key: 'core-brand', innerHTML: brand.value.css }] : [] }))
useHead({ titleTemplate: title => title && title !== site.value ? `${title} · ${site.value}` : site.value })
// Until the theatre says its site is ready, every page asks search engines to stay away (C-42).
const { data: settings } = await usePublicSettings()
useSeoMeta({ robots: () => settings.value?.['public-site.search.hidden']?.value === true ? 'noindex' : undefined })
</script>

<template>
  <UApp
    :locale="locale"
    :toaster="toaster"
  >
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
