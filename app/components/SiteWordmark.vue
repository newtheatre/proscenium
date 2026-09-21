<script setup lang="ts">
// The house wordmark, in one place because the header and the footer both draw it. Plain text
// rather than a link: `UHeader` and `UFooter` wrap it in their own anchor already (0021).
defineProps<{ gold?: boolean }>()
</script>

<template>
  <span
    class="flex flex-col leading-none"
    data-test="site-wordmark"
  >
    <!-- The theatre's name is read, not decoration, so it clears the small-text floor and takes a
         foreground that measures against stage black rather than the muted one (K-101). -->
    <span class="font-mono text-xs uppercase tracking-[0.18em] text-toned">The Nottingham</span>
    <span class="nnt-headline text-lg">New <span :class="gold ? 'text-secondary' : ''">Theatre</span></span>
  </span>
</template>
