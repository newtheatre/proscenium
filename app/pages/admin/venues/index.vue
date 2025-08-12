<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <h1 class="admin-page__title">
        Venues Management
      </h1>
      <p class="admin-page__subtitle">
        Manage theatre venues and spaces
      </p>
    </header>

    <div class="admin-page__content">
      <!-- Venue management content would go here -->
      <p>This page will contain venue management functionality.</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
definePageMeta({
  middleware: ['admin'],
  layout: 'admin',
})
</script>

<style scoped>
.admin-page__header {
  margin-bottom: var(--spacing-2xl);
}

.admin-page__title {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--primary-text-color);
  margin-bottom: var(--spacing-sm);
}

.admin-page__subtitle {
  color: var(--secondary-text-color);
  font-size: 1.1rem;
  margin: 0;
}

.admin-page__content {
  background-color: var(--secondary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: var(--spacing-xl);
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .admin-page__title {
    font-size: 2rem;
  }

  .admin-page__subtitle {
    font-size: 1rem;
  }

  .admin-page__content {
    padding: var(--spacing-lg);
  }
}

@media (max-width: 480px) {
  .admin-page__title {
    font-size: 1.75rem;
  }

  .admin-page__subtitle {
    font-size: 0.9rem;
  }
}
</style>
