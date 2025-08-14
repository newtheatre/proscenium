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
      v-else-if="error"
      class="feature-edit__error"
    >
      <AppAlert type="error">
        {{ error.statusMessage || 'Failed to load feature details' }}
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
            :model-value="name.value.value"
            label="Feature Name"
            placeholder="Enter feature name"
            :error="name.error.value"
            :touched="name.touched.value"
            required
            @update:model-value="name.setValue"
            @blur="name.setTouched()"
          />

          <FormTextarea
            id="description"
            :model-value="description.value.value"
            label="Description"
            placeholder="Enter feature description"
            :error="description.error.value"
            :touched="description.touched.value"
            :rows="3"
            @update:model-value="description.setValue"
            @blur="description.setTouched()"
          />

          <FormInput
            id="icon"
            :model-value="icon.value.value"
            label="Icon"
            placeholder="Enter icon (emoji or short text)"
            :error="icon.error.value"
            :touched="icon.touched.value"
            @update:model-value="icon.setValue"
            @blur="icon.setTouched()"
          />

          <FormCheckbox
            id="isActive"
            :model-value="Boolean(isActive.value.value)"
            label="Active"
            description="Whether this feature is currently active and available for assignment"
            @update:model-value="isActive.setValue"
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
import type { VenueFeatureResponse, VenueFeatureUpdatePayload } from '~~/shared/types/api'

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

// Form setup using useForm composable
const form = useForm({
  initialValues: {
    name: feature.value?.name || '',
    description: feature.value?.description || '',
    icon: feature.value?.icon || '',
    isActive: feature.value?.isActive ?? true,
  },
  onSubmit: async (values) => {
    try {
      const payload: VenueFeatureUpdatePayload = {
        name: values.name,
        description: values.description || undefined,
        icon: values.icon || undefined,
        isActive: values.isActive,
      }

      await $fetch(`/api/venues/features/${featureId.value}`, {
        method: 'PATCH',
        body: payload,
      })

      // Navigate back to feature detail page
      await navigateTo(`/admin/venues/features/${featureId.value}`)
    }
    catch (error: unknown) {
      let errorMessage = 'Failed to update venue feature'
      if (error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) {
        errorMessage = String(error.data.message)
      }
      form.setFormError(errorMessage)
    }
  },
})

// Individual field controls
const name = form.register('name', feature.value?.name || '')
const description = form.register('description', feature.value?.description || '')
const icon = form.register('icon', feature.value?.icon || '')
const isActive = form.register('isActive', feature.value?.isActive ?? true)
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
