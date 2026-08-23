<script lang="ts" setup>
/**
 * The show night shell. Its only job is the practice banner, which lives here
 * so a new FOH screen cannot be built without it (docs/14 §3.1).
 */
</script>

<template>
  <div>
    <TrainingBanner />
    <slot />
  </div>
</template>
