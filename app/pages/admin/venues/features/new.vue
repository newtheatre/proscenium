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
import { venueFeatureCreateFormSchema } from '~/utils/validation'

// Require admin access
definePageMeta({
  middleware: 'admin',
  layout: 'admin',
  title: 'Create Venue Feature',
})

// Initialize form with empty defaults
const defaultFormData = {
  name: '',
  description: '',
  icon: '',
  isActive: true,
}

// Form submission handler
const handleFormSubmit = async (values: typeof defaultFormData) => {
  console.log('Creating new venue feature with data:', values)

  // Transform the data for API - only include non-empty values
  const createData: Record<string, unknown> = {
    name: values.name,
    description: values.description || undefined,
    icon: values.icon || undefined,
    isActive: values.isActive,
  }

  console.log('Sending API create with data:', createData)

  const response = await $fetch<{ success: boolean, data: { feature: { id: string } } }>('/api/venues/features', {
    method: 'POST' as const,
    body: createData,
  })

  // Navigate to the new feature's detail page
  await navigateTo(`/admin/venues/features/${response.data.feature.id}`)
}

// Initialize useForm
const form = useForm({
  initialValues: defaultFormData,
  onSubmit: handleFormSubmit,
  schema: venueFeatureCreateFormSchema,
})

// Individual reactive form fields
const nameField = form.reactiveField('name')
const descriptionField = form.reactiveField('description')
const iconField = form.reactiveField('icon')
const isActiveField = form.reactiveField<boolean>('isActive', true)
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
