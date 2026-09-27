<script setup lang="ts">
// A volunteer arriving at the theatre looks at whatever page is already open, so every public and
// member page carries the way in while they are on shift (0094). The guard on /tonight still decides.
const { account } = useAccount()
</script>

<template>
  <div
    v-if="account.onShiftTonight"
    class="dark bg-primary text-inverted"
    data-test="on-shift-bar"
  >
    <UContainer class="flex min-h-12 items-center justify-between gap-3">
      <p class="text-sm font-medium">
        You are on shift tonight
      </p>
      <UButton
        to="/tonight"
        size="lg"
        color="neutral"
        variant="solid"
        trailing-icon="i-lucide-arrow-right"
        class="min-h-12"
      >
        Open Tonight
      </UButton>
    </UContainer>
  </div>
</template>
