<script setup lang="ts">
// One titled block of a show-night screen: a mono, spaced heading over a dark card, so a glance
// finds the section it wants without reading any of the others.
defineProps<{ title: string }>()
</script>

<template>
  <section class="rounded-xl bg-elevated p-4">
    <h2 class="mb-3 font-mono text-xs tracking-[0.2em] text-secondary uppercase">
      {{ title }}
    </h2>
    <slot />
  </section>
</template>
