<!-- Live mode (UI-05): a layout, not a shell. Full screen, dark unless the person chose otherwise
     (middleware/appearance.global.ts), no navigation of its own, every control at least 48 pixels
     (main.css). Each page draws its own status strip through PageLive, which says what the screen is,
     which performance, whether the device is online, and the way out. -->
<script setup lang="ts">
useHead({ bodyAttrs: { class: 'live-shell' } })
</script>

<template>
  <div class="live-shell flex min-h-[calc(100svh-var(--practice-banner,0px))] flex-col bg-default text-default">
    <SkipLink />
    <main
      id="main"
      tabindex="-1"
      class="flex min-w-0 flex-1 flex-col outline-none"
    >
      <slot />
    </main>
  </div>
</template>
