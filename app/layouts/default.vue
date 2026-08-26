<script setup lang="ts">
// Public surfaces get the expressive kit; the chrome is stage black in both colour modes.
// That is one `dark` class on the subtree, never an override of slot classes.
const links = [
  { label: 'What\'s on', to: '/whats-on' },
  { label: 'Get involved', to: '/get-involved' },
  { label: 'Visit us', to: '/visit' },
]
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <div class="dark">
      <UHeader :ui="{ root: 'bg-default' }">
        <template #title>
          <span class="nnt-headline text-lg">The Nottingham New Theatre</span>
        </template>
        <UNavigationMenu :items="links" />
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
      </UFooter>
    </div>
  </div>
</template>
