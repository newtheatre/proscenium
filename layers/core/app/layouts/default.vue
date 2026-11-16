<!-- The public shell until workstream 6's interface lands: the brand's stylesheet, a skip link, the
     theatre's name or logo, the menu from site/content/navigation.yml (C-40) and a footer. -->
<script setup lang="ts">
const { data: brand } = await useBrand()
const { data: navigation } = await useAsyncData('core:navigation', () => queryCollection('navigation').first())

useHead(() => ({
  link: [{ rel: 'stylesheet', href: `/api/core/branding/theme.css?v=${brand.value?.revision ?? 0}` }],
}))

const name = computed(() => brand.value?.name ?? '')
const external = (to: string) => /^(https:|mailto:)/.test(to)
</script>

<template>
  <div class="shell">
    <a
      href="#main"
      class="skip"
    >Skip to content</a>
    <header class="header">
      <NuxtLink
        to="/"
        class="home"
      >
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
            class="logo"
          >
        </picture>
        <span v-else>{{ name || 'Home' }}</span>
      </NuxtLink>
      <nav
        v-if="navigation?.header?.length"
        aria-label="Main"
      >
        <ul>
          <li
            v-for="link in navigation.header"
            :key="link.to"
          >
            <a
              v-if="external(link.to)"
              :href="link.to"
            >{{ link.label }}</a>
            <NuxtLink
              v-else
              :to="link.to"
            >
              {{ link.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>
    </header>
    <main id="main">
      <slot />
    </main>
    <footer class="footer">
      <nav
        v-if="navigation?.footer?.length"
        aria-label="Footer"
      >
        <ul>
          <li
            v-for="link in navigation.footer"
            :key="link.to"
          >
            <a
              v-if="external(link.to)"
              :href="link.to"
            >{{ link.label }}</a>
            <NuxtLink
              v-else
              :to="link.to"
            >
              {{ link.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>
      <p v-if="brand?.creditLine">
        Powered by Proscenium
      </p>
    </footer>
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; display: flex; flex-direction: column; background: var(--brand-background); color: var(--brand-text); }
.skip { position: absolute; left: -999px; }
.skip:focus { left: 1rem; top: 1rem; }
.header, .footer { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: space-between; padding: 1rem; }
.home { font-family: var(--brand-display-font); font-weight: 600; color: inherit; text-decoration: none; }
.logo { max-height: 3rem; width: auto; }
nav ul { display: flex; flex-wrap: wrap; gap: 1rem; list-style: none; margin: 0; padding: 0; }
a { color: var(--brand-link); }
main { flex: 1; padding: 0 1rem; }
.footer { border-top: 1px solid var(--brand-border); color: var(--brand-muted); }
</style>
