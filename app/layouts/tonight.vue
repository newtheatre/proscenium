<script setup lang="ts">
// A phone held in a foyer is not a dashboard: a plain dark subtree, big targets, nothing that
// needs a mouse (docs/design-language.md). The hub is the navigation; there is no sidebar.
const route = useRoute()

// The hub is the way back, so it does not offer a link to itself.
const atTheHub = computed(() => route.path === '/tonight')
</script>

<template>
  <div class="dark min-h-screen bg-default text-default [color-scheme:dark]">
    <header class="flex h-14 items-center justify-between gap-2 border-b border-default px-4">
      <h2
        v-if="atTheHub"
        class="nnt-headline text-lg"
      >
        Tonight
      </h2>
      <UButton
        v-else
        to="/tonight"
        variant="ghost"
        color="neutral"
        icon="i-lucide-chevron-left"
        class="min-h-12 min-w-12 -ml-2"
      >
        Tonight
      </UButton>
      <AuthStatus />
    </header>
    <main class="p-4">
      <slot />
    </main>
  </div>
</template>
