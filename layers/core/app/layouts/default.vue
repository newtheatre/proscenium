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
// The phone menu ends with the account's own links (AC-4): My account, the inbox and Sign out, or
// Sign in for a visitor, so they are found where the rest of the menu is.
const { viewer } = useViewer()
const { signOut } = useSignOut()
const accountLinks = computed(() => viewer.value.signedIn
  ? [
      { label: t('core.menu.my-account'), icon: 'i-lucide-circle-user', to: '/account', active: route.path === '/account' || (route.path.startsWith('/account/') && route.path !== '/account/inbox') },
      { label: t('core.navigation.inbox.label'), icon: 'i-lucide-inbox', to: '/account/inbox', active: route.path === '/account/inbox' },
      { label: t('core.menu.sign-out'), icon: 'i-lucide-log-out', onSelect: () => { void signOut() } },
    ]
  : [{ label: t('core.menu.sign-in'), icon: 'i-lucide-log-in', to: `/sign-in?next=${encodeURIComponent(route.fullPath)}` }])
const footer = computed(() => (navigation.value?.footer ?? []).map(l => ({ label: l.label, to: l.to, target: /^https:/.test(l.to) ? '_blank' : undefined })))
// Until the first Owner is made the site has nothing to show: every page points to setup, and
// setup itself is drawn without the site's links or a way to sign in.
const onSetup = computed(() => route.path === '/setup')
const { data: setup } = await useAPI<{ needed: boolean }>('/api/core/setup', { key: 'core:setup' })
const setupNeeded = computed(() => setup.value?.needed === true && !viewer.value.signedIn)
</script>

<template>
  <div>
    <SkipLink />
    <UHeader
      :title="name"
      :toggle="!onSetup"
    >
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
        v-if="!onSetup"
        :items="links"
        :aria-label="t('core.public.navigation')"
      />
      <template #right>
        <template v-if="!onSetup">
          <InboxBell side="audience" />
          <AccountMenu />
        </template>
      </template>
      <template
        v-if="!onSetup"
        #body
      >
        <UNavigationMenu
          :items="links"
          orientation="vertical"
          :aria-label="t('core.public.navigation')"
        />
        <USeparator class="my-4" />
        <UNavigationMenu
          :items="accountLinks"
          orientation="vertical"
          :aria-label="t('core.menu.account')"
        />
      </template>
    </UHeader>

    <UMain
      id="main"
      tabindex="-1"
      class="outline-none"
    >
      <UContainer
        v-if="setupNeeded && !onSetup"
        class="pt-6"
      >
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-wand-sparkles"
          :title="t('core.public.setup-needed.title')"
          :description="t('core.public.setup-needed.description')"
          :actions="[{ label: t('core.public.setup-needed.action'), to: '/setup', trailingIcon: 'i-lucide-arrow-right' }]"
        />
      </UContainer>
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
