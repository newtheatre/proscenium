<template>
  <div class="feature-create">
    <header class="feature-create__header">
      <div class="feature-create__title-section">
        <h1 class="feature-create__title">
          Create New Venue Feature
        </h1>
        <UIButton
          variant="secondary"
          @click="navigateTo('/admin/venues/features')"
        >
          Back to Features
        </UIButton>
      </div>
    </header>

    <div class="feature-create__content">
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
        </div>

        <div class="form-actions">
          <FormButton
            type="submit"
            :disabled="form.isSubmitting.value || !form.isValid.value"
          >
            {{ form.isSubmitting.value ? 'Creating Feature...' : 'Create Feature' }}
          </FormButton>

          <UIButton
            type="button"
            variant="ghost"
            @click="navigateTo('/admin/venues/features')"
          >
            Cancel
          </UIButton>
        </div>
      </Form>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { VenueFeatureCreatePayload } from '~~/shared/types/api'

// Require admin access
definePageMeta({
  middleware: 'admin',
  layout: 'admin',
})

// Form setup using useForm composable
const form = useForm({
  initialValues: {
    name: '',
    description: '',
    icon: '',
  },
  onSubmit: async (values) => {
    try {
      const payload: VenueFeatureCreatePayload = {
        name: values.name,
        description: values.description || undefined,
        icon: values.icon || undefined,
      }

      const response = await $fetch<{ success: boolean, data: { feature: { id: string } } }>('/api/venues/features', {
        method: 'POST',
        body: payload,
      })

      // Navigate to the new feature's detail page
      await navigateTo(`/admin/venues/features/${response.data.feature.id}`)
    }
    catch (error: unknown) {
      let errorMessage = 'Failed to create venue feature'
      if (error && typeof error === 'object' && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) {
        errorMessage = String(error.data.message)
      }
      form.setFormError(errorMessage)
    }
  },
})

// Individual field controls
const name = form.register('name', '')
const description = form.register('description', '')
const icon = form.register('icon', '')
</script>

<style scoped>
.feature-create {
  padding: 24px;
  max-width: 800px;
  margin: 0 auto;
}

.feature-create__header {
  margin-bottom: 32px;
}

.feature-create__title-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.feature-create__title {
  font-size: 28px;
  font-weight: 600;
  color: var(--primary-text-color);
  margin: 0;
}

.feature-create__content {
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
  .feature-create {
    padding: 16px;
  }

  .feature-create__title-section {
    flex-direction: column;
    align-items: flex-start;
  }

  .feature-create__content {
    padding: 20px;
  }

  .form-actions {
    flex-direction: column-reverse;
  }
}
</style>
