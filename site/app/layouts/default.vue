<!-- The New Theatre's public shell: upstream's (layers/core/app/layouts/default.vue) with the house's
     chrome. Header and footer are stage black in both colour modes, done by marking them .dark; the
     header's one call to action is Book tickets, which goes to what's on. The links and their rules
     are upstream's (What's on and Past shows, then site/content/navigation.yml, then every policy),
     except that the roll of honour is in the footer only.
     What's on gets the house's photo band above upstream's page. -->
<script setup lang="ts">
const { t } = useT()
const { data: brand } = await useBrand()
const { data: navigation } = await useAsyncData('core:navigation', () => queryCollection('navigation').first())
const route = useRoute()
const { data: settings } = await usePublicSettings()

// The brand's tokens are set by app.vue for every shell; the heading font is the public shell's alone.
useHead({ bodyAttrs: { class: 'public-shell' } })

const BOOKING_TO = '/whats-on'
const name = computed(() => brand.value?.name ?? t('core.public.default-name'))
// The logo on stage black: the dark-mode logo where there is one.
const logo = computed(() => brand.value?.logoDark ?? brand.value?.logo ?? null)
const external = (to: string) => (/^https:/.test(to) ? '_blank' : undefined)
const pastShows = computed(() => settings.value?.['public-site.archive.public']?.value === true)
const roll = computed(() => settings.value?.['awards.roll.public']?.value === true)
// The header leaves out what's on, since Book tickets beside it goes there, and the roll of honour,
// which the house keeps to the footer (Matt, 2026-11-19).
const links = computed(() => [
  ...(pastShows.value ? [{ label: t('core.public.past-shows'), to: '/shows' }] : []),
  ...(navigation.value?.header ?? []),
].map(l => ({ label: l.label, to: l.to, target: external(l.to), active: route.path === l.to || route.path.startsWith(`${l.to}/`) })))

const { viewer } = useViewer()
const { signOut } = useSignOut()
const accountLinks = computed(() => viewer.value.signedIn
  ? [
      { label: t('core.menu.my-account'), icon: 'i-lucide-circle-user', to: '/account', active: route.path === '/account' || (route.path.startsWith('/account/') && route.path !== '/account/inbox') },
      { label: t('core.navigation.inbox.label'), icon: 'i-lucide-inbox', to: '/account/inbox', active: route.path === '/account/inbox' },
      { label: t('core.menu.sign-out'), icon: 'i-lucide-log-out', onSelect: () => { void signOut() } },
    ]
  : [{ label: t('core.menu.sign-in'), icon: 'i-lucide-log-in', to: `/sign-in?next=${encodeURIComponent(route.fullPath)}` }])
// What modules put beside the account menu (usePublicHeaderItems), such as tickets being held; a name nobody answers to is left out.
const { vueApp } = useNuxtApp()
const headerNames = usePublicHeaderItems()
const headerItems = computed(() => headerNames.value.flatMap((name) => {
  const component = vueApp.component(name)
  return component ? [{ name, component }] : []
}))

// The footer in columns: seeing a show, the theatre's own pages, and every policy the site has.
const { data: policies } = await useAPI<{ policies: { id: string, title: string }[] }>('/api/core/policies', { key: 'core:policies', default: () => ({ policies: [] }) })
const columns = computed(() => [
  {
    label: 'Visit',
    links: [
      { label: t('core.public.whats-on'), to: '/whats-on' },
      ...(pastShows.value ? [{ label: t('core.public.past-shows'), to: '/shows' }] : []),
      { label: 'Venues', to: '/venues' },
      ...(roll.value ? [{ label: t('core.public.roll-of-honour'), to: '/awards' }] : []),
    ],
  },
  { label: 'The theatre', links: navigation.value?.footer ?? [] },
  { label: 'Policies', links: (policies.value?.policies ?? []).map(p => ({ label: p.title, to: `/policies/${p.id}` })) },
].filter(c => c.links.length))
const year = new Date().getFullYear()

const onSetup = computed(() => route.path === '/setup')
const whatsOn = computed(() => route.path === '/whats-on')
const { data: setup } = await useAPI<{ needed: boolean }>('/api/core/setup', { key: 'core:setup' })
const setupNeeded = computed(() => setup.value?.needed === true && !viewer.value.signedIn)
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SkipLink />
    <!-- Until the first Owner is made, a banner across the top of every page points to setup. -->
    <UBanner
      v-if="setupNeeded && !onSetup"
      color="info"
      icon="i-lucide-wand-sparkles"
      :title="t('core.public.setup-needed.title')"
      :actions="[{ label: t('core.public.setup-needed.action'), to: '/setup', color: 'neutral', variant: 'outline', trailingIcon: 'i-lucide-arrow-right' }]"
    />
    <div class="dark">
      <UHeader
        :title="name"
        :toggle="!onSetup"
        :ui="{ root: 'bg-default border-b border-default' }"
      >
        <template
          v-if="logo"
          #title
        >
          <img
            :src="logo.url"
            :alt="logo.alt || name"
            :width="logo.width ?? undefined"
            :height="logo.height ?? undefined"
            class="block h-7 w-auto sm:h-9"
          >
        </template>
        <UNavigationMenu
          v-if="!onSetup"
          :items="links"
          :aria-label="t('core.public.navigation')"
        />
        <template #right>
          <template v-if="!onSetup">
            <div class="peer contents">
              <component
                :is="item.component"
                v-for="item in headerItems"
                :key="item.name"
              />
            </div>
            <InboxBell side="audience" />
            <!-- On a phone a module's item (tickets held) takes the place of the Sign in icon, which the menu repeats. -->
            <div :class="viewer.signedIn ? 'contents' : 'peer-has-[a]:max-lg:hidden'">
              <AccountMenu />
            </div>
            <UButton
              :to="BOOKING_TO"
              label="Book tickets"
              size="sm"
              class="nnt-button-poster ms-2 hidden sm:inline-flex"
            />
          </template>
        </template>
        <template
          v-if="!onSetup"
          #body
        >
          <UNavigationMenu
            :items="[{ label: t('core.public.whats-on'), to: '/whats-on' }, ...links]"
            orientation="vertical"
            :aria-label="t('core.public.navigation')"
          />
          <USeparator class="my-4" />
          <UNavigationMenu
            :items="accountLinks"
            orientation="vertical"
            :aria-label="t('core.menu.account')"
          />
          <UButton
            :to="BOOKING_TO"
            label="Book tickets"
            block
            class="nnt-button-poster mt-6"
          />
        </template>
      </UHeader>
    </div>

    <UMain
      id="main"
      tabindex="-1"
      class="grow outline-none"
    >
      <!-- What's on is the platform's page, so the house's band goes here and the page's own plain
           header is hidden under it (assets/css/nnt.css). A slim band, as the spotlight follows it. -->
      <NntHero
        v-if="whatsOn"
        src="/images/banners/whats-on.webp"
        align="start"
        slim
      >
        <template #title>
          What's <span class="text-(--color-gold-400)">on</span>
        </template>
        <template #description>
          Everything here is written, directed, built and performed by students. Booking holds your
          seats, and you pay at the box office on the night.
        </template>
      </NntHero>
      <div :class="{ 'nnt-whats-on': whatsOn }">
        <slot />
      </div>
    </UMain>

    <div class="dark">
      <UFooter :ui="{ root: 'bg-default', top: 'border-b border-default' }">
        <template #top>
          <UContainer class="grid gap-10 py-12 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div class="flex flex-col gap-3">
              <img
                v-if="logo"
                :src="logo.url"
                :alt="logo.alt || name"
                :width="logo.width ?? undefined"
                :height="logo.height ?? undefined"
                class="block h-9 w-auto self-start"
              >
              <p
                v-else
                class="nnt-headline text-xl text-highlighted"
              >
                {{ name }}
              </p>
              <p class="max-w-xs text-sm text-muted">
                England's only student-run theatre, in Nottingham.
              </p>
              <UBadge
                color="secondary"
                variant="subtle"
                label="100 years, 1926 to 2026"
                class="self-start"
              />
            </div>
            <nav
              class="flex flex-wrap gap-x-12 gap-y-8"
              :aria-label="t('core.public.footer-navigation')"
            >
              <div
                v-for="column in columns"
                :key="column.label"
                class="flex flex-col gap-1.5"
              >
                <p class="text-sm font-semibold text-highlighted">
                  {{ column.label }}
                </p>
                <ULink
                  v-for="l in column.links"
                  :key="l.to"
                  :to="l.to"
                  :target="external(l.to)"
                  class="text-sm text-muted hover:text-default"
                >
                  {{ l.label }}
                </ULink>
              </div>
            </nav>
          </UContainer>
        </template>
        <template #left>
          <p class="text-xs text-muted">
            &copy; {{ year }} The Nottingham New Theatre
          </p>
        </template>
        <ULink
          to="/about#getting-in-touch"
          class="text-xs text-muted hover:text-default"
        >
          Contact us
        </ULink>
        <template #right>
          <p class="text-xs text-muted">
            <span
              v-if="brand?.creditLine"
              class="me-3"
            >{{ t('core.public.credit') }}</span>
            <span class="font-mono">newtheatre.org.uk</span>
          </p>
        </template>
      </UFooter>
    </div>
  </div>
</template>
