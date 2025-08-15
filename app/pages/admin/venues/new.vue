<template>
  <div class="venue-create">
    <header class="venue-create__header">
      <div class="venue-create__title-section">
        <h1 class="venue-create__title">
          Create New Venue
        </h1>
        <UIButton
          variant="secondary"
          @click="navigateTo('/admin/venues')"
        >
          Back to Venues
        </UIButton>
      </div>
    </header>

    <div class="venue-create__content">
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
              v-if="availableFeatures && availableFeatures.length > 0"
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

            <!-- Always show Create Feature button -->
            <div class="create-feature-section">
              <UIButton
                variant="secondary"
                size="sm"
                @click="showCreateFeatureModal = true"
              >
                Create New Feature
              </UIButton>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <FormButton
            type="submit"
            :disabled="form.isSubmitting.value || !form.isValid.value"
          >
            {{ form.isSubmitting.value ? 'Creating Venue...' : 'Create Venue' }}
          </FormButton>

          <UIButton
            type="button"
            variant="ghost"
            @click="navigateTo('/admin/venues')"
          >
            Cancel
          </UIButton>
        </div>
      </Form>
    </div>

    <!-- Create Feature Warning Modal -->
    <UIConfirmModal
      :show="showCreateFeatureModal"
      title="Create New Feature"
      message="Creating a new feature will take you to a different page and your current venue will not be saved. Are you sure you want to continue?"
      confirm-text="Continue"
      cancel-text="Cancel"
      @confirm="handleCreateFeature"
      @cancel="showCreateFeatureModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { venueCreateFormSchema } from '~/utils/validation'

// Require admin access
definePageMeta({
  middleware: 'admin',
  layout: 'admin',
  title: 'Create Venue',
})

// Fetch available features
const { data: featuresResponse, pending: featuresLoading, error: featuresError } = await useFetch('/api/venues/features', {
  query: { isActive: 'true' },
})

// Extract features from paginated response
const availableFeatures = computed(() => featuresResponse.value?.data || [])

// Initialize form with empty defaults
const defaultFormData = {
  name: '',
  address: '',
  capacity: '',
  imageUrl: '',
  notes: '',
  isActive: true,
}

// Form submission handler
const handleFormSubmit = async (values: typeof defaultFormData) => {
  console.log('Creating new venue with data:', values)
  console.log('Selected features:', selectedFeatures.value)

  // Transform the data for API
  const createData: Record<string, unknown> = {
    name: values.name,
    address: values.address || undefined,
    capacity: values.capacity ? Number(values.capacity) : undefined,
    imageUrl: values.imageUrl || undefined,
    notes: values.notes || undefined,
    isActive: values.isActive,
    featureIds: selectedFeatures.value,
  }

  console.log('Sending API create with data:', createData)

  const response = await $fetch<{ success: boolean, data: { venue: { id: string } } }>('/api/venues', {
    method: 'POST' as const,
    body: createData,
  })

  // Navigate to the new venue's detail page
  await navigateTo(`/admin/venues/${response.data.venue.id}`)
}

// Initialize useForm
const form = useForm({
  initialValues: defaultFormData,
  onSubmit: handleFormSubmit,
  schema: venueCreateFormSchema,
})

// Individual reactive form fields
const nameField = form.reactiveField('name')
const addressField = form.reactiveField('address')
const capacityField = form.reactiveField('capacity')
const imageUrlField = form.reactiveField('imageUrl')
const notesField = form.reactiveField('notes')
const isActiveField = form.reactiveField<boolean>('isActive', true)

// Selected features reactive state
const selectedFeatures = ref<string[]>([])

// Modal state for create feature warning
const showCreateFeatureModal = ref(false)

// Feature selection handler - using modern approach similar to edit page
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

// Create feature modal handler
const handleCreateFeature = () => {
  showCreateFeatureModal.value = false
  navigateTo('/admin/venues/features/new')
}
</script>

<style scoped>
.venue-create {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.venue-create__header {
  margin-bottom: 32px;
}

.venue-create__title-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.venue-create__title {
  font-size: 28px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.venue-create__content {
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

.no-features p {
  margin: 0 0 16px 0;
}

.create-feature-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: center;
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
  .venue-create {
    padding: 16px;
  }

  .venue-create__title-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .venue-create__content {
    padding: 20px;
  }

  .form-actions {
    flex-direction: column-reverse;
  }
}
</style>
