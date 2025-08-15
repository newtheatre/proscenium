<template>
  <div class="venue-detail">
    <header class="venue-detail__header">
      <div class="venue-detail__title-section">
        <h1 class="venue-detail__title">
          Venue Details
        </h1>
        <div class="venue-detail__actions">
          <UIButton
            variant="secondary"
            @click="navigateTo('/admin/venues')"
          >
            Back to Venues
          </UIButton>
          <UIButton
            variant="primary"
            @click="navigateTo(`/admin/venues/${venueId}/edit`)"
          >
            Edit Venue
          </UIButton>
          <UIButton
            v-if="venue?.isActive"
            variant="secondary"
            :class="{ 'button--danger': true }"
            @click="showDeleteModal = true"
          >
            Delete Venue
          </UIButton>
        </div>
      </div>
    </header>

    <div
      v-if="pending"
      class="venue-detail__loading"
    >
      <LoadingSpinner />
    </div>

    <div
      v-else-if="error"
      class="venue-detail__error"
    >
      <AppAlert type="error">
        {{ error.statusMessage || 'Failed to load venue details' }}
      </AppAlert>
    </div>

    <div
      v-else-if="venue"
      class="venue-detail__content"
    >
      <!-- Venue Status Cards -->
      <div class="venue-detail__status-cards">
        <div class="status-card">
          <h3 class="status-card__title">
            Venue Status
          </h3>
          <div class="status-card__content">
            <div class="status-item">
              <span class="status-item__label">Status:</span>
              <UIStatusBadge
                :variant="venueStatus?.active.variant"
                :label="venueStatus?.active.label"
              />
            </div>
            <div class="status-item">
              <span class="status-item__label">Capacity:</span>
              <span class="status-item__value">
                {{ venue.capacity ? `${venue.capacity} people` : 'Not specified' }}
              </span>
            </div>
            <div class="status-item">
              <span class="status-item__label">Features:</span>
              <span class="status-item__value">
                {{ venue.features?.length || 0 }} feature{{ (venue.features?.length || 0) === 1 ? '' : 's' }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Venue Information -->
      <div class="venue-detail__section">
        <h2 class="section-title">
          Basic Information
        </h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Name:</span>
            <span class="info-value">{{ venue.name }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Address:</span>
            <div
              v-if="venue.address"
              class="info-value info-value--multiline"
            >
              {{ venue.address }}
            </div>
            <span
              v-else
              class="info-value"
            >No address provided</span>
          </div>
          <div class="info-item">
            <span class="info-label">Capacity:</span>
            <span class="info-value">{{ venue.capacity ? `${venue.capacity} people` : 'Not specified' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Created:</span>
            <span class="info-value">{{ formatDate(venue.createdAt) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Last Updated:</span>
            <span class="info-value">{{ formatDate(venue.updatedAt) }}</span>
          </div>
        </div>
      </div>

      <!-- Venue Image -->
      <div
        v-if="venue.imageUrl"
        class="venue-detail__section"
      >
        <h2 class="section-title">
          Venue Image
        </h2>
        <div class="venue-image">
          <img
            :src="venue.imageUrl"
            :alt="venue.name"
            class="venue-image__img"
          >
        </div>
      </div>

      <!-- Venue Features -->
      <div class="venue-detail__section">
        <h2 class="section-title">
          Features
        </h2>
        <div
          v-if="venue.features && venue.features.length > 0"
          class="features-grid"
        >
          <div
            v-for="feature in venue.features"
            :key="feature.id"
            class="feature-card"
          >
            <div class="feature-header">
              <span
                v-if="feature.icon"
                class="feature-icon"
              >{{ feature.icon }}</span>
              <h3 class="feature-name">
                {{ feature.name }}
              </h3>
            </div>
            <p
              v-if="feature.description"
              class="feature-description"
            >
              {{ feature.description }}
            </p>
          </div>
        </div>
        <div
          v-else
          class="no-features"
        >
          <p>No features assigned to this venue.</p>
        </div>
      </div>

      <!-- Venue Notes -->
      <div
        v-if="venue.notes"
        class="venue-detail__section"
      >
        <h2 class="section-title">
          Notes
        </h2>
        <div class="notes-content">
          <p>{{ venue.notes }}</p>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <UIConfirmModal
      :show="showDeleteModal"
      title="Delete Venue"
      :message="`Are you sure you want to delete the venue '${venue?.name}'?`"
      details="This action will deactivate the venue and it will no longer be available for use. This action can be reversed by editing the venue and setting it to active again."
      confirm-text="Delete Venue"
      cancel-text="Cancel"
      loading-text="Deleting..."
      :loading="isDeleting"
      is-danger
      @confirm="handleDeleteVenue"
      @cancel="showDeleteModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import type { VenueResponse } from '~~/shared/types/api'

// Require admin access
definePageMeta({
  middleware: 'admin',
  layout: 'admin',
  title: 'Venue Details',
})

// Get venue ID from route params
const route = useRoute()
const venueId = computed(() => route.params.id as string)

// Fetch venue data
const { data: venueResponse, pending, error } = await useFetch<VenueResponse>(`/api/venues/${venueId.value}`)

// Extract venue from the response
const venue = computed(() => venueResponse.value?.data?.venue)

// Computed status information
const venueStatus = computed(() => {
  if (!venue.value) return null

  return {
    active: {
      variant: venue.value.isActive ? 'success' : 'danger',
      label: venue.value.isActive ? 'Active' : 'Inactive',
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

const handleDeleteVenue = async () => {
  if (!venue.value) return

  isDeleting.value = true

  try {
    await $fetch(`/api/venues/${venueId.value}`, {
      method: 'DELETE',
    })

    // Show success message and redirect
    await navigateTo('/admin/venues')
  }
  catch (error) {
    console.error('Failed to delete venue:', error)
    // TODO: Show error message to user
    showDeleteModal.value = false
  }
  finally {
    isDeleting.value = false
  }
}
</script>

<style scoped>
.venue-detail {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.venue-detail__header {
  margin-bottom: 32px;
}

.venue-detail__title-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.venue-detail__title {
  font-size: 28px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.venue-detail__actions {
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

.venue-detail__loading,
.venue-detail__error {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.venue-detail__content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.venue-detail__status-cards {
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

.venue-detail__section {
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

.venue-image {
  display: flex;
  justify-content: center;
}

.venue-image__img {
  max-width: 100%;
  max-height: 400px;
  border-radius: var(--border-radius);
  object-fit: cover;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.feature-card {
  background: var(--primary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 16px;
}

.feature-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.feature-icon {
  font-size: 18px;
}

.feature-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.feature-description {
  color: var(--secondary-text-color);
  margin: 0;
  font-size: 14px;
}

.no-features {
  text-align: center;
  color: var(--secondary-text-color);
  padding: 40px 0;
}

.notes-content {
  color: var(--primary-text-color);
  line-height: 1.6;
}

.info-value--multiline {
  white-space: pre-line;
}

@media (max-width: 768px) {
  .venue-detail {
    padding: 16px;
  }

  .venue-detail__title-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .venue-detail__actions {
    width: 100%;
    flex-direction: column;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }
}
</style>
