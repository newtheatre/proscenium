<template>
  <div class="admin-dashboard">
    <header class="admin-dashboard__header">
      <h1 class="admin-dashboard__title">
        Admin Dashboard
      </h1>

      <AdminWelcome :user="user" />
    </header>

    <AdminSectionGrid :sections="adminSections" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
  layout: 'admin',
})

const { user } = useAuth()

// Admin sections configuration
const adminSections = [
  {
    title: 'User Management',
    description: 'Manage system users and their roles.',
    path: '/admin/users',
    icon: 'account',
  },
  {
    title: 'Venues',
    description: 'Manage theatre venues and spaces.',
    path: '/admin/venues',
    icon: 'settings',
  },
  {
    title: 'Shows',
    description: 'Manage productions and performances.',
    path: '/admin/shows',
    icon: 'menu',
  },
  {
    title: 'Festivals',
    description: 'Manage festival events and programming.',
    path: '/admin/festivals',
    icon: 'menu',
  },
  {
    title: 'Tickets',
    description: 'Manage ticketing and reservations.',
    path: '/admin/tickets',
    icon: 'email',
  },
  {
    title: 'Front of House',
    description: 'Manage FOH operations and staff.',
    path: '/admin/foh',
    icon: 'su',
  },
]
</script>

<style scoped>
.admin-dashboard__header {
  margin-bottom: var(--spacing-2xl);
}

.admin-dashboard__title {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--primary-text-color);
  margin-bottom: var(--spacing-lg);
  text-align: center;
}

/* Mobile responsiveness */
@media (max-width: 768px) {
  .admin-dashboard__title {
    font-size: 2rem;
  }
}

@media (max-width: 480px) {
  .admin-dashboard__title {
    font-size: 1.75rem;
  }
}
</style>
