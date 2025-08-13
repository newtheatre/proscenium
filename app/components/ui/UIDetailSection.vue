<template>
  <section class="detail-section">
    <h2 class="detail-section__title">
      {{ title }}
    </h2>
    <div class="detail-section__content">
      <slot />
    </div>
  </section>
</template>

<script lang="ts" setup>
interface Props {
  title: string
}

defineProps<Props>()
</script>

<style scoped>
.detail-section {
  background: var(--secondary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: var(--spacing-lg);
}

.detail-section__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 var(--spacing-md) 0;
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
}

.detail-section__content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}
</style>
