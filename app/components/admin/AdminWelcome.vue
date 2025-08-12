<template>
  <div class="admin-welcome">
    <h2 class="admin-welcome__title">
      Welcome, {{ user?.profile?.name || user?.email }}!
    </h2>
    <p class="admin-welcome__subtitle">
      You have admin access. Your roles: {{ user?.roles.join(', ') }}
    </p>
  </div>
</template>

<script setup lang="ts">
interface Props {
  user: AuthUser | undefined
}

defineProps<Props>()
</script>

<style scoped>
.admin-welcome {
  background-color: var(--secondary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: var(--spacing-xl);
  margin-bottom: var(--spacing-xl);
}

.admin-welcome__title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--primary-text-color);
  margin-bottom: var(--spacing-sm);
}

.admin-welcome__subtitle {
  color: var(--secondary-text-color);
  font-size: 1rem;
  margin: 0;
}

/* Mobile responsiveness */
@media (max-width: 480px) {
  .admin-welcome {
    padding: var(--spacing-lg);
  }

  .admin-welcome__title {
    font-size: 1.25rem;
  }

  .admin-welcome__subtitle {
    font-size: 0.9rem;
  }
}
</style>
