<script setup lang="ts">
// A resident device in the wings, joined by a spoken code and no account (E-120). One tap out of
// the board mid-show is the defect, so there is nothing here to tap out to.
useHead({ bodyAttrs: { class: 'nnt-night' } })
</script>

<template>
  <div class="dark flex min-h-dvh flex-col bg-default text-default [color-scheme:dark]">
    <!-- The board's own controls sit at the foot of the wings device, so the sheet clears the
         home indicator rather than hiding a call button behind it (K-102 criterion 2). -->
    <main
      class="flex grow flex-col p-4"
      style="padding-bottom: calc(1rem + env(safe-area-inset-bottom))"
    >
      <slot />
    </main>
  </div>
</template>
