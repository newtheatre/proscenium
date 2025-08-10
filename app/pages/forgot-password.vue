<template>
  <div class="forgot-password-container">
    <div class="forgot-password">
      <h2 class="forgot-password__title">
        Forgot Your Password?
      </h2>

      <div class="forgot-password__content">
        <!-- Show success message if email was sent -->
        <AppAlert
          v-if="showSuccessMessage"
          type="success"
        >
          {{ successMessage }}
        </AppAlert>

        <!-- Email form (for initiating password reset) -->
        <Form
          v-if="!showSuccessMessage"
          :error="emailForm.formError.value"
          @submit="emailForm.handleSubmit"
        >
          <p class="forgot-password__description">
            Enter your email address and we'll send you a link to reset your password.
          </p>

          <FormInput
            id="email"
            :model-value="email.value.value"
            label="Email"
            type="email"
            autocomplete="email"
            placeholder="Enter your email address"
            :error="email.error.value"
            :touched="email.touched.value"
            @update:model-value="email.setValue"
            @blur="email.setTouched()"
          />

          <FormButton
            type="submit"
            :disabled="emailForm.isSubmitting.value || !emailForm.isValid.value"
          >
            {{ emailForm.isSubmitting.value ? 'Sending...' : 'Send Reset Link' }}
          </FormButton>
        </Form>

        <p class="forgot-password__back">
          Remember your password?
          <NuxtLink
            to="/login"
            class="forgot-password__link"
          >Back to Login</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { forgotPasswordEmailSchema } from '~/utils/validation'

definePageMeta({
  middleware: 'guest',
})

// Success state
const showSuccessMessage = ref(false)
const successMessage = ref('')

// Email form (for initiating password reset)
const emailForm = useForm({
  schema: forgotPasswordEmailSchema,
  initialValues: {
    email: '',
  },
  onSubmit: async (values) => {
    try {
      await $fetch('/api/auth/password/reset', {
        method: 'POST',
        body: values,
      })

      // Show success message
      showSuccessMessage.value = true
      successMessage.value = 'If an account with this email exists, we\'ve sent you a password reset link. Please check your email.'
    }
    catch (error) {
      console.error('Password reset request failed:', error)

      let errorMessage = 'An unexpected error occurred. Please try again.'

      if (error && typeof error === 'object') {
        if ('data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) {
          errorMessage = String(error.data.message)
        }
        else if ('message' in error) {
          errorMessage = String(error.message)
        }
      }

      emailForm.setFormError(errorMessage)
    }
  },
})

// Form field registrations
const email = emailForm.register('email', '')
</script>

<style scoped>
.forgot-password-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 50vh;
  padding: 1.5rem;
}

.forgot-password {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border: var(--nnt-orange) solid 2px;
}

.forgot-password__title {
  text-align: center;
  margin-bottom: 1.5rem;
  color: var(--primary-text-color);
  font-weight: 600;
}

.forgot-password__content {
  width: 100%;
}

.forgot-password__description {
  margin-bottom: 1.5rem;
  color: var(--secondary-text-color);
  text-align: center;
  font-size: 0.875rem;
  line-height: 1.5;
}

.forgot-password__back {
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.875rem;
  color: var(--secondary-text-color);
}

.forgot-password__link {
  color: var(--nnt-purple);
  text-decoration: none;
  font-weight: 500;
}

.forgot-password__link:hover {
  text-decoration: underline;
}
</style>
