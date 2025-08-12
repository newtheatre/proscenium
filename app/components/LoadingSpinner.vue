<template>
  <div class="loading-spinner">
    <span class="sr-only">Loading...</span>
    <div class="loading-spinner__circle" />
  </div>
</template>

<script setup lang="ts">
// Simple loading spinner component
</script>

<style scoped>
.loading-spinner {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.loading-spinner__circle {
  width: 24px;
  height: 24px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: var(--nnt-purple);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
