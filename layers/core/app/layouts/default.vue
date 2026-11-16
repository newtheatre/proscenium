<!-- The public shell, plain until the interface workstream's design lands: a skip link, a header
     with the theatre's name or logo, the menu from site/content/navigation.yml (C-40) and the
     colour-mode switch, the page, and a footer. The brand's colours come from its stylesheet (C-35). -->
<script setup lang="ts">
const { data: brand } = await useBrand()
const { data: navigation } = await useAsyncData('core:navigation', () => queryCollection('navigation').first())

useHead(() => ({
  link: [{ rel: 'stylesheet', href: `/api/core/branding/theme.css?v=${brand.value?.revision ?? 0}` }],
}))

const name = computed(() => brand.value?.name ?? 'Home')
const items = (links?: { label: string, to: string }[]) => (links ?? []).map(link => ({ label: link.label, to: link.to, target: /^https:/.test(link.to) ? '_blank' : undefined }))
const header = computed(() => items(navigation.value?.header))
const footer = computed(() => items(navigation.value?.footer))
</script>

<template>
  <div>
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-default focus:px-3 focus:py-2"
    >Skip to content</a>
    <UHeader
      :title="name"
      :toggle="false"
    >
      <template
        v-if="brand?.logo"
        #title
      >
        <picture>
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
      </template>
      <UNavigationMenu
        v-if="header.length"
        :items="header"
        aria-label="Main"
      />
      <template #right>
        <UColorModeButton />
      </template>
    </UHeader>
    <UMain id="main">
      <slot />
    </UMain>
    <UFooter>
      <template #left>
        <p
          v-if="brand?.creditLine"
          class="text-sm text-muted"
        >
          Runs on Proscenium
        </p>
      </template>
      <UNavigationMenu
        v-if="footer.length"
        :items="footer"
        variant="link"
        aria-label="Footer"
      />
    </UFooter>
  </div>
</template>
