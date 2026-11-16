<!-- The public shell (UI-01): the theatre's header and footer around a page rendered on the server.
     To restyle it, put a file at site/app/layouts/default.vue: it wins, with no other edit. Its
     links are the theatre's own, from site/content/navigation.yml; its name, logos and colours are
     the brand's (C-35). -->
<script setup lang="ts">
const { t } = useT()
const { data: brand } = await useBrand()
const { data: navigation } = await useAsyncData('core:navigation', () => queryCollection('navigation').first())
const route = useRoute()

useHead(() => ({
  link: [{ rel: 'stylesheet', href: `/api/core/branding/theme.css?v=${brand.value?.revision ?? 0}` }],
}))

const name = computed(() => brand.value?.name ?? t('core.public.default-name'))
const links = computed(() => [
  { label: t('core.public.whats-on'), to: '/whats-on' },
  ...(navigation.value?.header ?? []),
].map(l => ({ label: l.label, to: l.to, target: /^https:/.test(l.to) ? '_blank' : undefined, active: route.path === l.to || route.path.startsWith(`${l.to}/`) })))
const footer = computed(() => (navigation.value?.footer ?? []).map(l => ({ label: l.label, to: l.to, target: /^https:/.test(l.to) ? '_blank' : undefined })))
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <SkipLink />
    <UHeader :title="name">
      <template #title>
        <picture v-if="brand?.logo">
          <source
            v-if="brand.logoDark"
            :srcset="brand.logoDark.url"
            media="(prefers-color-scheme: dark)"
          >
          <img
            :src="brand.logo.url"
            :alt="brand.logo.alt || name"
            :width="brand.logo.width ?? undefined"
            :height="brand.logo.height ?? undefined"
            class="h-10 w-auto"
          >
        </picture>
        <span
          v-else
          class="font-semibold"
        >{{ name }}</span>
      </template>
      <UNavigationMenu
        :items="links"
        :aria-label="t('core.public.navigation')"
      />
      <template #right>
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
      class="flex-1 outline-none"
    >
      <slot />
    </UMain>

    <!-- One shape for everybody: the same footer signed in or out. -->
    <footer class="border-t border-default py-8">
      <UContainer class="flex flex-col gap-4 text-sm sm:flex-row sm:items-start sm:justify-between">
        <nav :aria-label="t('core.public.footer-navigation')">
          <ul class="flex flex-wrap gap-x-5 gap-y-2">
            <li
              v-for="l in footer"
              :key="l.to"
            >
              <ULink
                :to="l.to"
                :target="l.target"
                class="text-muted hover:text-highlighted"
              >
                {{ l.label }}
              </ULink>
            </li>
          </ul>
        </nav>
        <p
          v-if="brand?.creditLine"
          class="text-muted"
        >
          {{ t('core.public.credit') }}
        </p>
      </UContainer>
    </footer>
  </div>
</template>
