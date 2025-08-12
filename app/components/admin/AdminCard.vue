<template>
  <NuxtLink
    :to="path"
    class="admin-card"
  >
    <div class="admin-card__icon">
      <Icon
        :name="`icon:${icon}`"
        size="24"
      />
    </div>
    <div class="admin-card__content">
      <h3 class="admin-card__title">
        {{ title }}
      </h3>
      <p class="admin-card__description">
        {{ description }}
      </p>
    </div>
    <div class="admin-card__arrow">
      <Icon
        name="icon:arrow"
        size="16"
      />
    </div>
  </NuxtLink>
</template>

<script setup lang="ts">
interface Props {
  title: string
  description: string
  path: string
  icon: string
}

defineProps<Props>()
</script>

<style scoped>
.admin-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  background-color: var(--secondary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  text-decoration: none;
  color: var(--primary-text-color);
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}

.admin-card:hover {
  background-color: var(--header-bg-color);
  border-color: var(--nnt-orange);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.admin-card:focus {
  outline: none;
  box-shadow: var(--focus-ring-orange);
}

.admin-card__icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--nnt-purple);
  border-radius: var(--border-radius);
  color: white;
  transition: all var(--transition-fast);
}

.admin-card:hover .admin-card__icon {
  background-color: var(--nnt-orange);
  transform: scale(1.1);
}

.admin-card__content {
  flex: 1;
}

.admin-card__title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: var(--spacing-xs);
  color: var(--primary-text-color);
}

.admin-card__description {
  font-size: 0.9rem;
  color: var(--secondary-text-color);
  margin: 0;
  line-height: 1.5;
}

.admin-card__arrow {
  flex-shrink: 0;
  color: var(--secondary-text-color);
  transition: all var(--transition-fast);
  transform: translateX(0);
}

.admin-card:hover .admin-card__arrow {
  color: var(--nnt-orange);
  transform: translateX(4px);
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .admin-card {
    padding: var(--spacing-lg);
  }

  .admin-card__icon {
    width: 40px;
    height: 40px;
  }

  .admin-card__title {
    font-size: 1.1rem;
  }

  .admin-card__description {
    font-size: 0.85rem;
  }
}

/* Focus and keyboard navigation improvements */
.admin-card:focus-visible {
  outline: 2px solid var(--nnt-orange);
  outline-offset: 2px;
}

/* Loading state for icons */
.admin-card__icon svg {
  transition: opacity var(--transition-fast);
}

/* Ensure proper contrast in dark mode */
@media (prefers-color-scheme: dark) {
  .admin-card {
    border-color: var(--border-color);
  }

  .admin-card:hover {
    border-color: var(--nnt-orange);
  }
}
</style>
