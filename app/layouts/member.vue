<script setup lang="ts">
import { MEMBER_NAV } from '#shared/utils/site-nav'

// Your own things: calm intensity and no sidebar, because a member checking a booking on a phone
// is not doing desk work (docs/design-language.md).
const links = MEMBER_NAV.map(entry => ({ label: entry.label, to: entry.to, exact: entry.exact }))
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <div class="dark">
      <UHeader :ui="{ root: 'bg-default' }">
        <template #title>
          <NuxtLink
            to="/"
            class="nnt-headline text-lg"
          >
            The Nottingham New Theatre
          </NuxtLink>
        </template>
        <template #right>
          <AuthStatus />
        </template>
      </UHeader>
    </div>

    <UMain class="grow">
      <!-- The strip is contained; the page is not, because every member screen already brings its
           own container, width and padding. -->
      <UContainer>
        <UNavigationMenu
          :items="links"
          highlight
          class="border-b border-default"
        />
      </UContainer>
      <slot />
    </UMain>

    <SiteFooter />
  </div>
</template>
