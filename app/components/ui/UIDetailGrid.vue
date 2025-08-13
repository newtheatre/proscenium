<template>
  <div class="detail-grid">
    <slot />
  </div>
</template>

<script lang="ts" setup>
// No props needed for this simple grid wrapper
</script>

<style scoped>
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--spacing-md);
}

@media (max-width: 768px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
