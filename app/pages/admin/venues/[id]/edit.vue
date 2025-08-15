<template>
  <div class="venue-edit">
    <header class="venue-edit__header">
      <div class="venue-edit__title-section">
        <h1 class="venue-edit__title">
          Edit Venue
        </h1>
        <div class="venue-edit__actions">
          <UIButton
            variant="secondary"
            @click="navigateTo(`/admin/venues/${venueId}`)"
          >
            View Venue
          </UIButton>
          <UIButton
            variant="secondary"
            @click="navigateTo('/admin/venues')"
          >
            Back to Venues
          </UIButton>
        </div>
      </div>
    </header>

    <div
      v-if="pending"
      class="venue-edit__loading"
    >
      <LoadingSpinner />
    </div>

    <div
      v-else-if="fetchError"
      class="venue-edit__error"
    >
      <AppAlert type="error">
        {{ fetchError.statusMessage || 'Failed to load venue details' }}
      </AppAlert>
    </div>

    <div
      v-else-if="venue"
      class="venue-edit__content"
    >
      <Form
        :error="form.formError.value"
        @submit="form.handleSubmit"
      >
        <div class="form-grid">
          <!-- Basic Information -->
          <div class="form-section">
            <h2 class="section-title">
              Basic Information
            </h2>

            <FormInput
              id="name"
              v-model="nameField"
              label="Venue Name"
              placeholder="Enter venue name"
              required
            />

            <FormTextarea
              id="address"
              v-model="addressField"
              label="Address"
              placeholder="Enter venue address"
              :rows="3"
            />

            <FormInput
              id="capacity"
              v-model="capacityField"
              label="Capacity"
              type="number"
              placeholder="Enter venue capacity"
              min="1"
            />

            <FormInput
              id="imageUrl"
              v-model="imageUrlField"
              label="Image URL"
              type="url"
              placeholder="Enter image URL"
            />

            <FormTextarea
              id="notes"
              v-model="notesField"
              label="Notes"
              placeholder="Enter any additional notes about the venue"
              :rows="4"
            />

            <FormCheckbox
              id="isActive"
              v-model="isActiveField"
              label="Active"
              description="Whether this venue is currently active and available for use"
            />
          </div>

          <!-- Features Selection -->
          <div class="form-section">
            <h2 class="section-title">
              Features
            </h2>

            <div
              v-if="featuresLoading"
              class="features-loading"
            >
              <LoadingSpinner />
            </div>

            <div
              v-else-if="featuresError"
              class="features-error"
            >
              <AppAlert type="error">
                Failed to load venue features
              </AppAlert>
            </div>

            <div
              v-else-if="availableFeatures && availableFeatures.length > 0"
              class="features-grid"
            >
              <FormCheckbox
                v-for="feature in availableFeatures"
                :id="`feature-${feature.id}`"
                :key="feature.id"
                :model-value="featureFields[feature.id]?.value"
                :label="feature.name"
                :description="feature.description"
                @update:model-value="(value: boolean) => {
                  const field = featureFields[feature.id]
                  if (field) field.value = value
                }"
              />
            </div>

            <div
              v-else
              class="no-features"
            >
              <p>No features available.</p>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <FormButton
            type="submit"
            :disabled="form.isSubmitting.value || !form.isValid.value"
          >
            {{ form.isSubmitting.value ? 'Updating Venue...' : 'Update Venue' }}
          </FormButton>

          <UIButton
            type="button"
            variant="ghost"
            @click="navigateTo(`/admin/venues/${venueId}`)"
          >
            Cancel
          </UIButton>
        </div>
      </Form>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { VenueResponse } from '~~/shared/types/api'

// Require admin access
definePageMeta({
  middleware: 'admin',
  layout: 'admin',
})

// Get venue ID from route params
const route = useRoute()
const venueId = route.params.id as string

// Fetch venue data and available features
const { data: venueResponse, pending, error: fetchError } = await useFetch<VenueResponse>(`/api/venues/${venueId}`)
const { data: featuresResponse, pending: featuresLoading, error: featuresError } = await useFetch('/api/venues/features', {
  query: { isActive: 'true' },
})

// Extract data from responses
const venue = computed(() => venueResponse.value?.data?.venue)
const availableFeatures = computed(() => featuresResponse.value?.data || [])

// Initialize form with default values from the response
const defaultFormData = {
  name: venue.value?.name || '',
  address: venue.value?.address || '',
  capacity: venue.value?.capacity?.toString() || '',
  imageUrl: venue.value?.imageUrl || '',
  notes: venue.value?.notes || '',
  isActive: venue.value?.isActive ?? true,
  featureIds: venue.value?.features.map(f => f.id) || [],
}

// Form submission handler
const handleFormSubmit = async (values: typeof defaultFormData, changedValues?: Partial<typeof defaultFormData>) => {
  const changes = changedValues || {}

  console.log('Submitting venue update (only changed fields):', changes)
  console.log('Changes detected:', Object.keys(changes).length, 'fields changed')

  // Check if features have changed separately since they're managed outside form state
  const originalFeatureIds = venue.value?.features.map(f => f.id) || []
  const currentFeatureIds = selectedFeatures.value
  const featuresChanged = JSON.stringify(originalFeatureIds.sort()) !== JSON.stringify(currentFeatureIds.sort())

  console.log('Features changed:', featuresChanged)
  console.log('Original features:', originalFeatureIds)
  console.log('Current features:', currentFeatureIds)

  // Only make API call if there are actual changes to form fields OR features
  if (Object.keys(changes).length === 0 && !featuresChanged) {
    console.log('No changes detected, navigating back without API call')
    await navigateTo(`/admin/venues/${venueId}`)
    return
  }

  // Transform the data for API
  const updateData: Record<string, unknown> = { ...changes }

  // Convert capacity to number if it's included in changes
  if ('capacity' in changes && changes.capacity !== undefined) {
    updateData.capacity = changes.capacity ? Number(changes.capacity) : null
  }

  // Always include feature IDs if they changed, or if other fields changed
  if (featuresChanged || Object.keys(changes).length > 0) {
    updateData.featureIds = selectedFeatures.value
  }

  console.log('Sending API update with data:', updateData)

  await $fetch(`/api/venues/${venueId}`, {
    method: 'PATCH',
    body: updateData,
  })

  // Navigate back to venue detail page
  await navigateTo(`/admin/venues/${venueId}`)
}

// Initialize useForm
const form = useForm({
  initialValues: defaultFormData,
  onSubmit: handleFormSubmit,
})

// Individual reactive form fields
const nameField = form.reactiveField('name')
const addressField = form.reactiveField('address')
const capacityField = form.reactiveField('capacity')
const imageUrlField = form.reactiveField('imageUrl')
const notesField = form.reactiveField('notes')
const isActiveField = form.reactiveField<boolean>('isActive', true)

// Selected features reactive state
const selectedFeatures = ref<string[]>(venue.value?.features.map(f => f.id) || [])

// Feature selection handler - using modern approach similar to roles
const featureFields = computed(() => {
  return availableFeatures.value.reduce((fields, feature) => {
    fields[feature.id] = computed({
      get: () => selectedFeatures.value.includes(feature.id),
      set: (checked: boolean) => {
        if (checked) {
          if (!selectedFeatures.value.includes(feature.id)) {
            selectedFeatures.value.push(feature.id)
          }
        }
        else {
          const index = selectedFeatures.value.indexOf(feature.id)
          if (index > -1) {
            selectedFeatures.value.splice(index, 1)
          }
        }
      },
    })
    return fields
  }, {} as Record<string, WritableComputedRef<boolean>>)
})

// Update selectedFeatures when venue data loads
watch(venue, (newVenue) => {
  if (newVenue) {
    selectedFeatures.value = newVenue.features.map(f => f.id) || []
  }
}, { immediate: true })
</script>

<style scoped>
.venue-edit {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.venue-edit__header {
  margin-bottom: 32px;
}

.venue-edit__title-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.venue-edit__title {
  font-size: 28px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.venue-edit__actions {
  display: flex;
  gap: 12px;
}

.venue-edit__loading,
.venue-edit__error {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.venue-edit__content {
  background: var(--secondary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 32px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-bottom: 32px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 4px 0;
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 8px;
}

.features-loading,
.features-error {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100px;
}

.features-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.no-features {
  text-align: center;
  color: var(--secondary-text-color);
  padding: 32px 0;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

@media (max-width: 1024px) {
  .form-grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }
}

@media (max-width: 768px) {
  .venue-edit {
    padding: 16px;
  }

  .venue-edit__title-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .venue-edit__actions {
    width: 100%;
    flex-direction: column;
  }

  .venue-edit__content {
    padding: 20px;
  }

  .form-actions {
    flex-direction: column-reverse;
  }
}
</style>
