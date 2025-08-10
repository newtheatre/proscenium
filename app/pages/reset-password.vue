<template>
  <div class="reset-password-container">
    <div class="reset-password">
      <h2 class="reset-password__title">
        Reset Your Password
      </h2>

      <div class="reset-password__content">
        <!-- Show success message if password was reset -->
        <AppAlert
          v-if="showSuccessMessage"
          type="success"
        >
          {{ successMessage }}
        </AppAlert>

        <!-- Show error if token is invalid or missing -->
        <AppAlert
          v-if="!hasValidToken && !showSuccessMessage"
          type="error"
        >
          Invalid or expired reset token. Please request a new password reset link.
        </AppAlert>

        <!-- Reset password form (when valid token is present) -->
        <Form
          v-if="hasValidToken && !showSuccessMessage"
          :error="resetForm.formError.value"
          @submit="resetForm.handleSubmit"
        >
          <p class="reset-password__description">
            Enter your new password below.
          </p>

          <FormInput
            id="newPassword"
            :model-value="newPassword.value.value"
            label="New Password"
            type="password"
            autocomplete="new-password"
            placeholder="Enter your new password"
            :error="newPassword.error.value"
            :touched="newPassword.touched.value"
            @update:model-value="newPassword.setValue"
            @blur="newPassword.setTouched()"
          />

          <FormInput
            id="confirmPassword"
            :model-value="confirmPassword.value.value"
            label="Confirm New Password"
            type="password"
            autocomplete="new-password"
            placeholder="Confirm your new password"
            :error="confirmPassword.error.value"
            :touched="confirmPassword.touched.value"
            @update:model-value="confirmPassword.setValue"
            @blur="confirmPassword.setTouched()"
          />

          <FormButton
            type="submit"
            :disabled="resetForm.isSubmitting.value || !resetForm.isValid.value"
          >
            {{ resetForm.isSubmitting.value ? 'Resetting...' : 'Reset Password' }}
          </FormButton>
        </Form>

        <p class="reset-password__back">
          <NuxtLink
            to="/login"
            class="reset-password__link"
          >
            Back to Login
          </NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { resetPasswordSchema } from '~/utils/validation'

definePageMeta({
  middleware: 'guest',
})

const route = useRoute()
const router = useRouter()

// Check if token is provided in query parameters
const token = computed(() => route.query.token as string || '')
const hasValidToken = computed(() => !!token.value)

// Success state
const showSuccessMessage = ref(false)
const successMessage = ref('')

// Reset password form (for completing password reset with token)
const resetForm = useForm({
  schema: resetPasswordSchema,
  initialValues: {
    newPassword: '',
    confirmPassword: '',
  },
  onSubmit: async (values) => {
    try {
      await $fetch('/api/auth/password/reset', {
        method: 'POST',
        body: {
          token: token.value,
          newPassword: values.newPassword,
        },
      })

      // Show success message
      showSuccessMessage.value = true
      successMessage.value = 'Your password has been reset successfully! You can now log in with your new password.'

      // Redirect to login after a short delay
      setTimeout(() => {
        router.push('/login')
      }, 3000)
    }
    catch (error) {
      console.error('Password reset failed:', error)

      let errorMessage = 'An unexpected error occurred. Please try again.'

      if (error && typeof error === 'object') {
        if ('data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) {
          errorMessage = String(error.data.message)
        }
        else if ('message' in error) {
          errorMessage = String(error.message)
        }
      }

      resetForm.setFormError(errorMessage)
    }
  },
})

// Form field registrations
const newPassword = resetForm.register('newPassword', '')
const confirmPassword = resetForm.register('confirmPassword', '')
</script>

<style scoped>
.reset-password-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 50vh;
  padding: 1.5rem;
}

.reset-password {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border: var(--nnt-orange) solid 2px;
}

.reset-password__title {
  text-align: center;
  margin-bottom: 1.5rem;
  color: var(--primary-text-color);
  font-weight: 600;
}

.reset-password__content {
  width: 100%;
}

.reset-password__description {
  margin-bottom: 1.5rem;
  color: var(--secondary-text-color);
  text-align: center;
  font-size: 0.875rem;
  line-height: 1.5;
}

.reset-password__back {
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.875rem;
  color: var(--secondary-text-color);
}

.reset-password__link {
  color: var(--nnt-purple);
  text-decoration: none;
  font-weight: 500;
}

.reset-password__link:hover {
  text-decoration: underline;
}
</style>
