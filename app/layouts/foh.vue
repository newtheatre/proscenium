<script setup lang="ts">
// A phone held in a foyer is not a dashboard: a plain dark subtree, big targets, nothing that
// needs a mouse (docs/design-language.md).
</script>

<template>
  <div class="dark min-h-screen bg-default text-default">
    <header class="flex items-center justify-between border-b border-default px-4 py-3">
      <span class="nnt-headline text-lg">Tonight</span>
      <AuthStatus />
    </header>
    <main class="p-4">
      <slot />
    </main>
  </div>
</template>
