<script setup lang="ts">
// Public surfaces get the expressive kit; the chrome is stage black in both colour modes.
// That is one `dark` class on the subtree, never an override of slot classes.

// The header stays to one clear action per audience; the full public nav, editorial pages
// included, lives in the footer via PUBLIC_NAV (D-103).
const { account } = useAccount()
const links = computed(() => (account.value.signedIn
  ? [{ label: 'What\'s on', to: '/whats-on' }, { label: 'Rooms', to: '/rooms' }, { label: 'My bookings', to: '/rooms/mine' }]
  : [{ label: 'What\'s on', to: '/whats-on' }]))
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
        <UNavigationMenu
          v-if="links.length"
          :items="links"
        />
        <template #right>
          <AuthStatus />
        </template>
      </UHeader>
    </div>

    <UMain class="grow">
      <slot />
    </UMain>

    <SiteFooter />
  </div>
</template>
