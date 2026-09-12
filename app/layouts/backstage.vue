<script setup lang="ts">
// A resident device in the wings, joined by a spoken code and no account (E-120). One tap out of
// the board mid-show is the defect, so there is nothing here to tap out to.
</script>

<template>
  <div class="dark flex min-h-screen flex-col bg-default text-default [color-scheme:dark]">
    <main class="flex grow flex-col p-4">
      <slot />
    </main>
  </div>
</template>
