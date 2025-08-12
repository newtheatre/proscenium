<template>
  <div class="admin-layout">
    <AppHeader />
    <main class="admin-layout__container">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.admin-layout {
  min-height: 100vh;
  background-color: var(--primary-bg-color);
}

.admin-layout__container {
  max-width: var(--page-max-width);
  margin: 0 auto;
  padding: var(--spacing-2xl) 0;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .admin-layout__container {
    padding: var(--spacing-lg);
  }
}

@media (max-width: 480px) {
  .admin-layout__container {
    padding: var(--spacing-md);
  }
}
</style>
