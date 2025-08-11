<template>
  <div class="users-table-container">
    <h1 class="page-title">
      Users Management
    </h1>

    <DataTable
      api-endpoint="/api/users"
      :columns="columns"
      :filters="filters"
      search-placeholder="Search users by email, name, or student ID..."
      empty-message="No users found"
      default-sort-by="createdAt"
      default-sort-order="desc"
      :default-per-page="5"
    />
    <!-- TODO: make the default per-page larger -->
  </div>
</template>

<script setup lang="ts">
import type { Column, Filter } from '~/components/table/types'
import { CommonRenderers, CommonFilterOptions } from '~/components/table/types'

// Require admin access
definePageMeta({
  middleware: 'admin',
})

// Define columns for the users table
const columns: Column[] = [
  {
    key: 'profile.name',
    label: 'Name',
    sortable: true,
    render: (value, row): string => {
      return String(value || row.email || 'No name')
    },
  },
  {
    key: 'email',
    label: 'Email',
    sortable: true,
  },
  {
    key: 'studentId',
    label: 'Student ID',
    sortable: true,
    render: (value): string => {
      return String(value || '-')
    },
  },
  {
    key: 'roles',
    label: 'Roles',
    sortable: false,
    render: (value): string => {
      if (!value || !Array.isArray(value) || value.length === 0) return 'User'
      return value.map((role: { role: string }) => role.role).join(', ')
    },
  },
  {
    key: 'membership.type',
    label: 'Membership',
    sortable: true,
    render: (value): string => {
      if (!value || value === 'UNKNOWN') return 'Not Set'
      return CommonRenderers.capitalize(value)
    },
  },
  {
    key: 'isActive',
    label: 'Status',
    sortable: true,
    render: CommonRenderers.status,
  },
  {
    key: 'lastLogin',
    label: 'Last Login',
    sortable: true,
    render: (value): string => {
      if (!value) return 'Never'
      return CommonRenderers.date(value)
    },
  },
  {
    key: 'createdAt',
    label: 'Created',
    sortable: true,
    render: CommonRenderers.date,
  },
]

// Define filters for the users table
const filters: Filter[] = [
  {
    key: 'role',
    label: 'Role',
    type: 'select',
    options: CommonFilterOptions.userRoles.map(role => ({
      value: role.value,
      label: role.label,
    })),
  },
  {
    key: 'membershipType',
    label: 'Membership',
    type: 'select',
    options: CommonFilterOptions.membershipTypes.map(membership => ({
      value: membership.value,
      label: membership.label,
    })),
  },
  {
    key: 'isActive',
    label: 'Status',
    type: 'boolean',
  },
]
</script>

<style scoped>
.users-table-container {
  padding: 24px;
  max-width: 100%;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin-bottom: 24px;
}

@media (max-width: 1024px) {
  .users-table-container {
    padding: 16px;
  }
}
</style>
