<script setup lang="ts">
import { MY_NAV } from '#shared/utils/site-nav'

// Your own things: calm intensity and no sidebar, because a member checking a booking on a phone
// is not doing desk work (docs/design-language.md).
const links = MY_NAV.map(entry => ({ label: entry.label, icon: entry.icon, to: entry.to, exact: entry.exact }))
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
        <template #body>
          <UNavigationMenu
            :items="links"
            orientation="vertical"
            highlight
          />
        </template>
      </UHeader>
    </div>

    <UMain class="grow">
      <!-- The strip is contained; the page is not, because every member screen already brings its
           own container, width and padding. Scrolling rather than wrapping keeps it one row. -->
      <UContainer class="overflow-x-auto">
        <UNavigationMenu
          :items="links"
          highlight
          class="border-b border-default w-max min-w-full"
        />
      </UContainer>
      <slot />
    </UMain>

    <SiteFooter />
  </div>
</template>
