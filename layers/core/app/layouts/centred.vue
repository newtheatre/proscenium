<!-- A centred single-task layout for sign-in and setup: one thing to do, nothing to wander off to. -->
<script setup lang="ts">
const brand = await useBrand()
</script>

<template>
  <div class="flex min-h-screen flex-col items-center px-4 py-10">
    <SkipLink />
    <p class="mb-8 text-lg font-semibold">
      {{ brand.name }}
    </p>
    <main
      id="main"
      tabindex="-1"
      class="w-full max-w-xl outline-none"
    >
      <slot />
    </main>
  </div>
</template>
