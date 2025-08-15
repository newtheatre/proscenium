<template>
  <div class="venue-features-container">
    <div class="page-header">
      <h1 class="page-title">
        Venue Features Management
      </h1>
      <div class="page-actions">
        <UIButton
          variant="secondary"
          @click="navigateTo('/admin/venues')"
        >
          Back to Venues
        </UIButton>
        <UIButton
          variant="primary"
          @click="navigateTo('/admin/venues/features/new')"
        >
          Add New Feature
        </UIButton>
      </div>
    </div>

    <DataTable
      ref="dataTable"
      api-endpoint="/api/venues/features"
      :columns="columns"
      :filters="filters"
      search-placeholder="Search features by name or description..."
      empty-message="No venue features found"
      default-sort-by="name"
      default-sort-order="desc"
      :default-per-page="10"
      enable-selection
    />
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h } from 'vue'
import type { Column, Filter } from '~/components/table/types'
import { CommonRenderers } from '~/components/table/types'
import TableActions from '~/components/table/TableActions.vue'

// Require admin access
definePageMeta({
  middleware: 'admin',
  layout: 'admin',
  title: 'Venue Features',
})

// Define columns for the venue features table
const columns: Column[] = [
  {
    key: 'name',
    label: 'Name',
    sortable: true,
  },
  {
    key: 'description',
    label: 'Description',
    sortable: false,
    render: (value): string => {
      return String(value || 'No description provided')
    },
  },
  {
    key: 'icon',
    label: 'Icon',
    sortable: false,
    render: (value): string => {
      return String(value || 'No icon')
    },
  },
  {
    key: '_count',
    label: 'Used by Venues',
    sortable: false,
    render: (value): string => {
      if (!value || typeof value !== 'object' || !('venues' in value)) return 'No venues'
      const count = value.venues as number
      return count === 0 ? 'No venues' : `${count} venue${count === 1 ? '' : 's'}`
    },
  },
  {
    key: 'isActive',
    label: 'Status',
    sortable: true,
    render: (value): string => {
      return value ? 'Active' : 'Inactive'
    },
  },
  {
    key: 'createdAt',
    label: 'Created',
    sortable: true,
    render: CommonRenderers.date,
  },
  {
    key: 'actions',
    label: 'Actions',
    sortable: false,
    component: defineComponent({
      props: {
        row: {
          type: Object,
          required: true,
        },
        value: {
          type: null,
          required: false,
        },
      },
      setup(props) {
        const featureActions = [
          {
            key: 'view',
            label: 'View',
            variant: 'primary' as const,
            path: '/admin/venues/features/{id}',
          },
          {
            key: 'edit',
            label: 'Edit',
            variant: 'secondary' as const,
            path: '/admin/venues/features/{id}/edit',
          },
        ]

        return () => h(TableActions, {
          row: props.row,
          value: props.value,
          actions: featureActions,
        })
      },
    }),
  },
]

// Define filters for the venue features table
const filters: Filter[] = [
  {
    key: 'isActive',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'true', label: 'Active' },
      { value: 'false', label: 'Inactive' },
    ],
  },
]
</script>

<style scoped>
.venue-features-container {
  padding: 24px;
  max-width: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.page-actions {
  display: flex;
  gap: 12px;
}

@media (max-width: 768px) {
  .venue-features-container {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .page-actions {
    width: 100%;
    flex-direction: column;
  }
}
</style>
