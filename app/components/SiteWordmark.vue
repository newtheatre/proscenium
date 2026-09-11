<script setup lang="ts">
// The house wordmark, in one place because the header and the footer both draw it. Plain text
// rather than a link: `UHeader` and `UFooter` wrap it in their own anchor already (0021).
defineProps<{ gold?: boolean }>()
</script>

<template>
  <span class="flex flex-col leading-none">
    <span class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">The Nottingham</span>
    <span class="nnt-headline text-lg">New <span :class="gold ? 'text-secondary' : ''">Theatre</span></span>
  </span>
</template>
