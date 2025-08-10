<template>
  <div class="setup-account-container">
    <div class="setup-account">
      <h2 class="setup-account__title">
        Complete Your Account Setup
      </h2>

      <div class="setup-account__content">
        <Form
          :error="form.formError.value"
          @submit="form.handleSubmit"
        >
          <FormInput
            id="name"
            :model-value="name.value.value"
            label="Full Name"
            type="text"
            autocomplete="name"
            placeholder="Enter your full name"
            :error="name.error.value"
            :touched="name.touched.value"
            @update:model-value="name.setValue"
            @blur="name.setTouched()"
          />

          <FormInput
            id="bio"
            :model-value="bio.value.value"
            label="Bio (Optional)"
            type="text"
            placeholder="Tell us about yourself"
            :error="bio.error.value"
            :touched="bio.touched.value"
            @update:model-value="bio.setValue"
            @blur="bio.setTouched()"
          />

          <FormInput
            id="gradYear"
            :model-value="gradYear.value.value"
            label="Graduation Year (Optional)"
            type="number"
            placeholder="e.g. 2024"
            :error="gradYear.error.value"
            :touched="gradYear.touched.value"
            @update:model-value="gradYear.setValue"
            @blur="gradYear.setTouched()"
          />

          <FormInput
            id="course"
            :model-value="course.value.value"
            label="Course (Optional)"
            type="text"
            placeholder="e.g. Computer Science"
            :error="course.error.value"
            :touched="course.touched.value"
            @update:model-value="course.setValue"
            @blur="course.setTouched()"
          />

          <div class="form-group">
            <label class="form-label">Membership Type</label>
            <select
              v-model="membershipType.value.value"
              class="form-select"
              @blur="membershipType.setTouched()"
            >
              <option value="">
                Select membership type
              </option>
              <option value="FULL">
                Full Member
              </option>
              <option value="ASSOCIATE">
                Associate Member
              </option>
              <option value="FELLOW">
                Fellow
              </option>
              <option value="ALUMNI">
                Alumni
              </option>
              <option value="GUEST">
                Guest
              </option>
            </select>
          </div>

          <div class="form-section">
            <h3 class="form-section__title">
              Social Links (Optional)
            </h3>

            <FormInput
              id="github"
              :model-value="github.value.value"
              label="GitHub"
              type="url"
              placeholder="https://github.com/username"
              :error="github.error.value"
              :touched="github.touched.value"
              @update:model-value="github.setValue"
              @blur="github.setTouched()"
            />

            <FormInput
              id="linkedin"
              :model-value="linkedin.value.value"
              label="LinkedIn"
              type="url"
              placeholder="https://linkedin.com/in/username"
              :error="linkedin.error.value"
              :touched="linkedin.touched.value"
              @update:model-value="linkedin.setValue"
              @blur="linkedin.setTouched()"
            />

            <FormInput
              id="instagram"
              :model-value="instagram.value.value"
              label="Instagram"
              type="url"
              placeholder="https://instagram.com/username"
              :error="instagram.error.value"
              :touched="instagram.touched.value"
              @update:model-value="instagram.setValue"
              @blur="instagram.setTouched()"
            />
          </div>

          <FormButton
            type="submit"
            :loading="form.isSubmitting.value"
          >
            Complete Setup
          </FormButton>
        </Form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'

definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

const setupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  bio: z.string().optional(),
  gradYear: z.string().optional(),
  course: z.string().optional(),
  membershipType: z.string().optional(),
  github: z.string().optional(),
  linkedin: z.string().optional(),
  instagram: z.string().optional(),
})

const form = useForm({
  schema: setupSchema,
  onSubmit: async (values) => {
    try {
      const socialLinks = {
        github: values.github || undefined,
        linkedin: values.linkedin || undefined,
        instagram: values.instagram || undefined,
      }

      const hasAnySocialLinks = Object.values(socialLinks).some(link => link)

      await $fetch('/api/auth/setup-account', {
        method: 'POST',
        body: {
          name: values.name,
          bio: values.bio || undefined,
          gradYear: values.gradYear ? parseInt(values.gradYear) : undefined,
          course: values.course || undefined,
          membershipType: values.membershipType || undefined,
          socialLinks: hasAnySocialLinks ? socialLinks : undefined,
        },
      })

      // Redirect to dashboard or profile
      await navigateTo('/')
    }
    catch (error: unknown) {
      const errorData = error as { data?: { message?: string } }
      form.setFormError(errorData?.data?.message || 'Setup failed. Please try again.')
    }
  },
})

const name = form.register('name', '')
const bio = form.register('bio', '')
const gradYear = form.register('gradYear', '')
const course = form.register('course', '')
const membershipType = form.register('membershipType', '')
const github = form.register('github', '')
const linkedin = form.register('linkedin', '')
const instagram = form.register('instagram', '')
</script>

<style scoped>
.setup-account-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 2rem;
}

.setup-account {
  max-width: 600px;
  width: 100%;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 2rem;
}

.setup-account__title {
  text-align: center;
  margin-bottom: 2rem;
  color: var(--color-primary);
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.2s;
}

.form-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-section {
  margin: 2rem 0;
  padding: 1.5rem;
  background: var(--color-background-secondary);
  border-radius: 8px;
}

.form-section__title {
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  color: var(--color-text-primary);
}
</style>
