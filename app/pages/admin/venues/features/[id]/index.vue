<template>
  <div class="feature-detail">
    <header class="feature-detail__header">
      <div class="feature-detail__title-section">
        <h1 class="feature-detail__title">
          Venue Feature Details
        </h1>
        <div class="feature-detail__actions">
          <UIButton
            variant="secondary"
            @click="navigateTo('/admin/venues/features')"
          >
            Back to Features
          </UIButton>
          <UIButton
            variant="primary"
            @click="navigateTo(`/admin/venues/features/${featureId}/edit`)"
          >
            Edit Feature
          </UIButton>
          <UIButton
            v-if="feature?.isActive"
            variant="secondary"
            :class="{ 'button--danger': true }"
            @click="showDeleteModal = true"
          >
            Delete Feature
          </UIButton>
        </div>
      </div>
    </header>

    <div
      v-if="pending"
      class="feature-detail__loading"
    >
      <LoadingSpinner />
    </div>

    <div
      v-else-if="error"
      class="feature-detail__error"
    >
      <AppAlert type="error">
        {{ error.statusMessage || 'Failed to load feature details' }}
      </AppAlert>
    </div>

    <div
      v-else-if="feature"
      class="feature-detail__content"
    >
      <!-- Feature Status Card -->
      <div class="feature-detail__status-cards">
        <div class="status-card">
          <h3 class="status-card__title">
            Feature Status
          </h3>
          <div class="status-card__content">
            <div class="status-item">
              <span class="status-item__label">Status:</span>
              <UIStatusBadge
                :variant="featureStatus?.active.variant"
                :label="featureStatus?.active.label"
              />
            </div>
            <div class="status-item">
              <span class="status-item__label">Used by Venues:</span>
              <span class="status-item__value">
                {{ feature.venues?.length || 0 }} venue{{ (feature.venues?.length || 0) === 1 ? '' : 's' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Feature Information -->
      <div class="feature-detail__section">
        <h2 class="section-title">
          Basic Information
        </h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Name:</span>
            <span class="info-value">{{ feature.name }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Description:</span>
            <span class="info-value">{{ feature.description || 'No description provided' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Icon:</span>
            <span class="info-value">
              <span
                v-if="feature.icon"
                class="feature-icon"
              >{{ feature.icon }}</span>
              <span v-else>No icon</span>
            </span>
          </div>
          <div class="info-item">
            <span class="info-label">Created:</span>
            <span class="info-value">{{ formatDate(feature.createdAt) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Last Updated:</span>
            <span class="info-value">{{ formatDate(feature.updatedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- Associated Venues -->
      <div class="feature-detail__section">
        <h2 class="section-title">
          Associated Venues
        </h2>
        <div
          v-if="feature.venues && feature.venues.length > 0"
          class="venues-grid"
        >
          <div
            v-for="venue in feature.venues"
            :key="venue.id"
            class="venue-card"
          >
            <div class="venue-header">
              <h3 class="venue-name">
                {{ venue.name }}
              </h3>
              <UIStatusBadge
                :variant="venue.isActive ? 'success' : 'danger'"
                :label="venue.isActive ? 'Active' : 'Inactive'"
              />
            </div>
            <p
              v-if="venue.address"
              class="venue-address"
            >
              {{ venue.address }}
            </p>
            <p
              v-if="venue.capacity"
              class="venue-capacity"
            >
              Capacity: {{ venue.capacity }} people
            </p>
            <div class="venue-actions">
              <UIButton
                size="sm"
                variant="primary"
                @click="navigateTo(`/admin/venues/${venue.id}`)"
              >
                View Venue
              </UIButton>
            </div>
          </div>
        </div>
        <div
          v-else
          class="no-venues"
        >
          <p>This feature is not currently used by any venues.</p>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <UIConfirmModal
      :show="showDeleteModal"
      title="Delete Feature"
      :message="`Are you sure you want to delete the feature '${feature?.name}'?`"
      details="This action will deactivate the feature and it will no longer be available for assignment to venues. This action can be reversed by editing the feature and setting it to active again."
      confirm-text="Delete Feature"
      cancel-text="Cancel"
      loading-text="Deleting..."
      :loading="isDeleting"
      is-danger
      @confirm="handleDeleteFeature"
      @cancel="showDeleteModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import type { VenueFeatureResponse } from '~~/shared/types/api'

// Require admin access
definePageMeta({
  middleware: 'admin',
  layout: 'admin',
})

// Get feature ID from route params
const route = useRoute()
const featureId = computed(() => route.params.id as string)

// Fetch feature data
const { data: featureResponse, pending, error } = await useFetch<VenueFeatureResponse>(`/api/venues/features/${featureId.value}`)

// Extract feature from the response
const feature = computed(() => featureResponse.value?.data?.feature)

// Computed status information
const featureStatus = computed(() => {
  if (!feature.value) return null

  return {
    active: {
      variant: feature.value.isActive ? 'success' : 'danger',
      label: feature.value.isActive ? 'Active' : 'Inactive',
    },
  }
})

// Format date helper
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Delete functionality
const showDeleteModal = ref(false)
const isDeleting = ref(false)

const handleDeleteFeature = async () => {
  if (!feature.value) return

  isDeleting.value = true

  try {
    await $fetch(`/api/venues/features/${featureId.value}`, {
      method: 'DELETE' as const,
    })

    // Show success message and redirect
    await navigateTo('/admin/venues/features')
  }
  catch (error) {
    console.error('Failed to delete feature:', error)
    // TODO: Show error message to user
    showDeleteModal.value = false
  }
  finally {
    isDeleting.value = false
  }
}
</script>

<style scoped>
.feature-detail {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.feature-detail__header {
  margin-bottom: 32px;
}

.feature-detail__title-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.feature-detail__title {
  font-size: 28px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.feature-detail__actions {
  display: flex;
  gap: 12px;
}

/* Danger button styling */
:deep(.button--danger) {
  background-color: var(--error);
  border-color: var(--error);
  color: white;
}

:deep(.button--danger:hover) {
  background-color: #dc2626;
  border-color: #dc2626;
}

:deep(.button--danger:disabled) {
  background-color: #fca5a5;
  border-color: #fca5a5;
  cursor: not-allowed;
}

.feature-detail__loading,
.feature-detail__error {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.feature-detail__content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.feature-detail__status-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.status-card {
  background: var(--secondary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 20px;
}

.status-card__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 16px 0;
}

.status-card__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-item__label {
  font-weight: 500;
  color: var(--secondary-text-color);
}

.status-item__value {
  color: var(--primary-text-color);
}

.feature-detail__section {
  background: var(--secondary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 24px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 20px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-weight: 500;
  color: var(--secondary-text-color);
  font-size: 14px;
}

.info-value {
  color: var(--primary-text-color);
  word-break: break-word;
}

.feature-icon {
  font-size: 18px;
}

.venues-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.venue-card {
  background: var(--primary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 16px;
}

.venue-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.venue-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.venue-address {
  color: var(--secondary-text-color);
  margin: 0 0 8px 0;
  font-size: 14px;
}

.venue-capacity {
  color: var(--secondary-text-color);
  margin: 0 0 12px 0;
  font-size: 14px;
}

.venue-actions {
  display: flex;
  gap: 8px;
}

.no-venues {
  text-align: center;
  color: var(--secondary-text-color);
  padding: 40px 0;
}

@media (max-width: 768px) {
  .feature-detail {
    padding: 16px;
  }

  .feature-detail__title-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .feature-detail__actions {
    width: 100%;
    flex-direction: column;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .venues-grid {
    grid-template-columns: 1fr;
  }

  .venue-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
