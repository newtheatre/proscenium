<script setup lang="ts">
// Public surfaces get the expressive kit; the chrome is stage black in both colour modes.
// That is one `dark` class on the subtree, never an override of slot classes.

const { account } = useAccount()

// Nothing for a signed-out visitor: the marketing pages are J-110's and do not exist, and a link
// to a route that 404s is worse than no header nav at all.
const links = computed(() => (account.value.signedIn
  ? [{ label: 'Rooms', to: '/rooms' }, { label: 'My bookings', to: '/rooms/mine' }]
  : []))

// Most members arrive by a link somebody sent them, so the footer is for finding your way back
// rather than for browsing.
const footer = computed(() => (account.value.signedIn
  ? [
      { label: 'Book a room', to: '/rooms' },
      { label: 'My bookings', to: '/rooms/mine' },
      { label: 'My profile', to: '/account/profile' },
      { label: 'Sign-in and security', to: '/account/security' },
    ]
  : [{ label: 'Sign in', to: '/sign-in' }, { label: 'Create an account', to: '/register' }]))
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

    <div class="dark">
      <UFooter :ui="{ root: 'bg-default' }">
        <template #left>
          <p class="text-sm text-muted">
            The Nottingham New Theatre, the country's only entirely student-run theatre.
          </p>
        </template>
        <template #right>
          <nav
            class="flex flex-wrap items-center gap-x-4 gap-y-1"
            data-test="footer-links"
          >
            <ULink
              v-for="link in footer"
              :key="link.to"
              :to="link.to"
              class="text-sm text-muted hover:text-default"
            >
              {{ link.label }}
            </ULink>
          </nav>
        </template>
      </UFooter>
    </div>
  </div>
</template>
