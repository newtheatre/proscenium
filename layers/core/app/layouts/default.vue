<!-- The public shell (UI-01): the theatre's header and footer around a page rendered on the server.
     To restyle it, put a file at site/app/layouts/default.vue: it wins, with no other edit. Its
     links are What's on and Past shows, then the theatre's own, from site/content/navigation.yml;
     its name, logos and colours are the brand's (C-35). -->
<script setup lang="ts">
const { t } = useT()
const { data: brand } = await useBrand()
const { data: navigation } = await useAsyncData('core:navigation', () => queryCollection('navigation').first())
const route = useRoute()
const { data: settings } = await usePublicSettings()

// The brand's tokens go into the page's head with the page, so no stylesheet request holds up the
// first paint and a saved brand shows on the next page load.
useHead(() => ({
  style: brand.value?.css ? [{ key: 'core-brand', innerHTML: brand.value.css }] : [],
}))

const name = computed(() => brand.value?.name ?? t('core.public.default-name'))
const links = computed(() => [
  { label: t('core.public.whats-on'), to: '/whats-on' },
  // The archive of past shows, unless the theatre keeps it private (public-site.archive.public).
  ...(settings.value?.['public-site.archive.public']?.value === true ? [{ label: t('core.public.past-shows'), to: '/shows' }] : []),
  // The roll of honour, when the awards module is on and the theatre shows it.
  ...(settings.value?.['awards.roll.public']?.value === true ? [{ label: t('core.public.roll-of-honour'), to: '/awards' }] : []),
  ...(navigation.value?.header ?? []),
].map(l => ({ label: l.label, to: l.to, target: /^https:/.test(l.to) ? '_blank' : undefined, active: route.path === l.to || route.path.startsWith(`${l.to}/`) })))
const footer = computed(() => (navigation.value?.footer ?? []).map(l => ({ label: l.label, to: l.to, target: /^https:/.test(l.to) ? '_blank' : undefined })))
</script>

<template>
  <div>
    <SkipLink />
    <UHeader :title="name">
      <template
        v-if="brand?.logo"
        #title
      >
        <UColorModeImage
          :light="brand.logo.url"
          :dark="brand.logoDark?.url ?? brand.logo.url"
          :alt="brand.logo.alt || name"
          :width="brand.logo.width ?? undefined"
          :height="brand.logo.height ?? undefined"
          class="h-10 w-auto"
        />
      </template>
      <UNavigationMenu
        :items="links"
        :aria-label="t('core.public.navigation')"
      />
      <template #right>
        <InboxBell side="audience" />
        <AccountMenu />
      </template>
      <template #body>
        <UNavigationMenu
          :items="links"
          orientation="vertical"
          :aria-label="t('core.public.navigation')"
        />
      </template>
    </UHeader>

    <UMain
      id="main"
      tabindex="-1"
      class="outline-none"
    >
      <slot />
    </UMain>

    <!-- One shape for everybody: the same footer signed in or out. -->
    <UFooter>
      <template
        v-if="brand?.creditLine"
        #left
      >
        <p class="text-sm text-muted">
          {{ t('core.public.credit') }}
        </p>
      </template>
      <UNavigationMenu
        :items="footer"
        variant="link"
        :aria-label="t('core.public.footer-navigation')"
      />
    </UFooter>
  </div>
</template>
