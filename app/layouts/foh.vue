<script lang="ts" setup>
/**
 * The show night shell. Its only job is the practice banner, which lives here
 * so a new FOH screen cannot be built without it (docs/14 §3.1).
 */
const training = useTrainingMode()

// Resolved before the banner renders, so a practice till is never served
// looking exactly like the real one. Bounded: /foh/emergency is on this path.
await useAsyncData('training-state-initial', async () => {
  await Promise.race([
    training.refresh(),
    new Promise(resolve => setTimeout(resolve, 1500)),
  ])
  return true
})
</script>

<template>
  <div>
    <TrainingBanner />
    <slot />
  </div>
</template>
