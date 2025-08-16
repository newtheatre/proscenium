<template>
  <div class="feature-edit">
    <header class="feature-edit__header">
      <div class="feature-edit__title-section">
        <h1 class="feature-edit__title">
          Edit Venue Feature
        </h1>
        <div class="feature-edit__actions">
          <UIButton
            variant="secondary"
            @click="navigateTo(`/admin/venues/features/${featureId}`)"
          >
            View Feature
          </UIButton>
          <UIButton
            variant="secondary"
            @click="navigateTo('/admin/venues/features')"
          >
            Back to Features
          </UIButton>
        </div>
      </div>
    </header>

    <div
      v-if="pending"
      class="feature-edit__loading"
    >
      <LoadingSpinner />
    </div>

    <div
      v-else-if="fetchError"
      class="feature-edit__error"
    >
      <AppAlert type="error">
        {{ fetchError.statusMessage || 'Failed to load feature details' }}
      </AppAlert>
    </div>

    <div
      v-else-if="feature"
      class="feature-edit__content"
    >
      <Form
        :error="form.formError.value"
        @submit="form.handleSubmit"
      >
        <div class="form-section">
          <h2 class="section-title">
            Feature Information
          </h2>

          <FormInput
            id="name"
            v-model="nameField"
            label="Feature Name"
            placeholder="Enter feature name"
            required
          />

          <FormTextarea
            id="description"
            v-model="descriptionField"
            label="Description"
            placeholder="Enter feature description"
            :rows="3"
          />

          <FormInput
            id="icon"
            v-model="iconField"
            label="Icon"
            placeholder="Enter icon (emoji or short text)"
          />

          <FormCheckbox
            id="isActive"
            v-model="isActiveField"
            label="Active"
            description="Whether this feature is currently active and available for assignment"
          />
        </div>

        <div class="form-actions">
          <FormButton
            type="submit"
            :disabled="form.isSubmitting.value || !form.isValid.value"
          >
            {{ form.isSubmitting.value ? 'Updating Feature...' : 'Update Feature' }}
          </FormButton>

          <UIButton
            type="button"
            variant="ghost"
            @click="navigateTo(`/admin/venues/features/${featureId}`)"
          >
            Cancel
          </UIButton>
        </div>
      </Form>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { VenueFeatureResponse } from '~~/shared/types/api'
import { venueFeatureEditFormSchema } from '~/utils/validation'

// Require admin access
definePageMeta({
  middleware: 'admin',
  layout: 'admin',
  title: 'Edit Venue Feature',
})

// Get feature ID from route params
const route = useRoute()
const featureId = route.params.id as string

// Fetch feature data
const { data: featureResponse, pending, error: fetchError } = await useFetch<VenueFeatureResponse>(`/api/admin/venue-features/${featureId}`)

// Extract feature from the response
const feature = computed(() => featureResponse.value?.data?.feature)

// Initialize form with default values from the response
const defaultFormData = {
  name: feature.value?.name || '',
  description: feature.value?.description || '',
  icon: feature.value?.icon || '',
  isActive: feature.value?.isActive ?? true,
}

// Form submission handler
const handleFormSubmit = async (values: typeof defaultFormData, changedValues?: Partial<typeof defaultFormData>) => {
  const changes = changedValues || {}

  // Only make API call if there are actual changes
  if (Object.keys(changes).length === 0) {
    await navigateTo(`/admin/venues/features/${featureId}`)
    return
  }

  // Transform the data for API - only include changed fields
  const updateData: Record<string, unknown> = {}

  Object.entries(changes).forEach(([key, value]) => {
    if (value !== undefined) {
      updateData[key] = value
    }
  })

  await $fetch(`/api/venue-features/${featureId}`, {
    method: 'PATCH',
    body: updateData,
  })

  // Navigate back to feature detail page
  await navigateTo(`/admin/venues/features/${featureId}`)
}

// Initialize useForm
const form = useForm({
  initialValues: defaultFormData,
  onSubmit: handleFormSubmit,
  schema: venueFeatureEditFormSchema,
})

// Individual reactive form fields
const nameField = form.reactiveField('name')
const descriptionField = form.reactiveField('description')
const iconField = form.reactiveField('icon')
const isActiveField = form.reactiveField<boolean>('isActive', true)
</script>

<style scoped>
.feature-edit {
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
}

.feature-edit__header {
  margin-bottom: 32px;
}

.feature-edit__title-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.feature-edit__title {
  font-size: 28px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.feature-edit__actions {
  display: flex;
  gap: 12px;
}

.feature-edit__loading,
.feature-edit__error {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.feature-edit__content {
  background: var(--secondary-bg-color);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  padding: 32px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 32px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0 0 4px 0;
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 8px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

@media (max-width: 768px) {
  .feature-edit {
    padding: 16px;
  }

  .feature-edit__title-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .feature-edit__actions {
    width: 100%;
    flex-direction: column;
  }

  .feature-edit__content {
    padding: 20px;
  }

  .form-actions {
    flex-direction: column-reverse;
  }
}
</style>
