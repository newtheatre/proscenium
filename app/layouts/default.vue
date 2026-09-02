<script setup lang="ts">
// Public surfaces get the expressive kit; the chrome is stage black in both colour modes.
// That is one `dark` class on the subtree, never an override of slot classes.

// Nothing in the header for a signed-out visitor: the marketing pages are J-110's and do not
// exist, and a link to a route that 404s is worse than no header nav at all.
const { account } = useAccount()
const links = computed(() => (account.value.signedIn
  ? [{ label: 'Rooms', to: '/rooms' }, { label: 'My bookings', to: '/rooms/mine' }]
  : []))
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
