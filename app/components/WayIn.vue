<script setup lang="ts">
// The spotlight ground with the wordmark over one card, in one place: what the way in looks like
// (docs/design-language.md, the chrome table), and what the error page borrows.
</script>

<template>
  <div class="nnt-spotlight">
    <UContainer class="max-w-md py-16">
      <div
        class="dark mb-8 flex justify-center text-default"
        data-test="way-in-wordmark"
      >
        <SiteWordmark gold />
      </div>

      <UPageCard>
        <slot />
      </UPageCard>
    </UContainer>
  </div>
</template>
