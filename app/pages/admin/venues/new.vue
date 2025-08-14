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
              :model-value="name.value.value"
              label="Venue Name"
              placeholder="Enter venue name"
              :error="name.error.value"
              :touched="name.touched.value"
              required
              @update:model-value="name.setValue"
              @blur="name.setTouched()"
            />

            <FormTextarea
              id="address"
              :model-value="address.value.value"
              label="Address"
              placeholder="Enter venue address"
              :error="address.error.value"
              :touched="address.touched.value"
              :rows="3"
              @update:model-value="address.setValue"
              @blur="address.setTouched()"
            />

            <FormInput
              id="capacity"
              :model-value="capacity.value.value"
              label="Capacity"
              type="number"
              placeholder="Enter venue capacity"
              :error="capacity.error.value"
              :touched="capacity.touched.value"
              min="1"
              @update:model-value="capacity.setValue"
              @blur="capacity.setTouched()"
            />

            <FormInput
              id="imageUrl"
              :model-value="imageUrl.value.value"
              label="Image URL"
              type="url"
              placeholder="Enter image URL"
              :error="imageUrl.error.value"
              :touched="imageUrl.touched.value"
              @update:model-value="imageUrl.setValue"
              @blur="imageUrl.setTouched()"
            />

            <FormTextarea
              id="notes"
              :model-value="notes.value.value"
              label="Notes"
              placeholder="Enter any additional notes about the venue"
              :error="notes.error.value"
              :touched="notes.touched.value"
              :rows="4"
              @update:model-value="notes.setValue"
              @blur="notes.setTouched()"
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
                :model-value="selectedFeatures.includes(feature.id)"
                :label="feature.name"
                :description="feature.description"
                @update:model-value="toggleFeature(feature.id, $event)"
              />
            </div>

            <div
              v-else
              class="no-features"
            >
              <p>No features available. You can create features first and then assign them to venues.</p>
              <UIButton
                variant="secondary"
                size="sm"
                @click="navigateTo('/admin/venues/features/new')"
              >
                Create Feature
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
  </div>
</template>

<script setup lang="ts">
// Require admin access
definePageMeta({
  middleware: 'admin',
  layout: 'admin',
})

// Fetch available features
const { data: featuresResponse, pending: featuresLoading, error: featuresError } = await useFetch('/api/venues/features', {
  query: { isActive: 'true' },
})

// Extract features from paginated response
const availableFeatures = computed(() => featuresResponse.value?.data || [])

// Selected features state
const selectedFeatures = ref<string[]>([])

// Form setup using useForm composable
const form = useForm({
  initialValues: {
    name: '',
    address: '',
    capacity: '',
    imageUrl: '',
    notes: '',
  },
  onSubmit: async (values) => {
    try {
      const payload: VenueCreatePayload = {
        name: values.name,
        address: values.address || undefined,
        capacity: values.capacity ? Number(values.capacity) : undefined,
        imageUrl: values.imageUrl || undefined,
        notes: values.notes || undefined,
        featureIds: selectedFeatures.value,
      }

      const response = await $fetch<{ success: boolean, data: { venue: { id: string } } }>('/api/venues', {
        method: 'POST',
        body: payload,
      })

      // Navigate to the new venue's detail page
      await navigateTo(`/admin/venues/${response.data.venue.id}`)
    }
    catch (error: unknown) {
      let errorMessage = 'Failed to create venue'
      if (error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) {
        errorMessage = String(error.data.message)
      }
      form.setFormError(errorMessage)
    }
  },
})

// Individual field controls
const name = form.register('name', '')
const address = form.register('address', '')
const capacity = form.register('capacity', '')
const imageUrl = form.register('imageUrl', '')
const notes = form.register('notes', '')

// Feature selection handler
const toggleFeature = (featureId: string, selected: boolean) => {
  if (selected) {
    if (!selectedFeatures.value.includes(featureId)) {
      selectedFeatures.value.push(featureId)
    }
  }
  else {
    const index = selectedFeatures.value.indexOf(featureId)
    if (index > -1) {
      selectedFeatures.value.splice(index, 1)
    }
  }
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
