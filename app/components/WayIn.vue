<script setup lang="ts">
// The way in (docs/design-language.md, the chrome table), also borrowed by the error page. As tall
// as the main region, so no band of page ground shows between it and the footer.
</script>

<template>
  <div class="nnt-spotlight min-h-[calc(100vh-var(--ui-header-height))]">
    <UContainer class="max-w-md py-16">
      <div
        class="dark mb-8 flex justify-center text-default"
        data-test="way-in-wordmark"
      >
        <SiteWordmark />
      </div>

      <UPageCard>
        <slot />
      </UPageCard>
    </UContainer>
  </div>
</template>
