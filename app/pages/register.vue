<template>
  <div class="registration-container">
    <div class="registration">
      <h2 class="registration__title">
        Register for New Theatre
      </h2>

      <AppAlert v-if="isLoggedIn">
        <!-- In theory this should never be displayed -->
        You are already logged in. Redirecting...
      </AppAlert>

      <AppAlert type="error">
        Registration is currently disabled. Please check back later.
      </AppAlert>

      <DevOnly
        class="registration__content"
      >
        <!-- Show success message after registration -->
        <AppAlert
          v-if="showSuccessMessage"
          type="success"
        >
          Registration successful! Please check your email for a verification link.
        </AppAlert>

        <Form
          v-if="!showSuccessMessage"
          :error="form.formError.value"
          @submit="form.handleSubmit"
        >
          <FormInput
            id="name"
            :model-value="name.value.value"
            label="Name"
            type="text"
            autocomplete="name"
            placeholder="Enter your name"
            :error="name.error.value"
            :touched="name.touched.value"
            @update:model-value="name.setValue"
            @blur="name.setTouched()"
          />

          <FormInput
            id="email"
            :model-value="email.value.value"
            label="Email"
            type="email"
            autocomplete="email"
            placeholder="Enter your email"
            :error="email.error.value"
            :touched="email.touched.value"
            @update:model-value="email.setValue"
            @blur="email.setTouched()"
          />

          <FormInput
            id="password"
            :model-value="password.value.value"
            label="Password"
            type="password"
            autocomplete="new-password"
            placeholder="Enter your password"
            :error="password.error.value"
            :touched="password.touched.value"
            @update:model-value="password.setValue"
            @blur="password.setTouched()"
          />

          <FormInput
            id="confirmPassword"
            :model-value="confirmPassword.value.value"
            label="Confirm Password"
            type="password"
            autocomplete="new-password"
            placeholder="Confirm your password"
            :error="confirmPassword.error.value"
            :touched="confirmPassword.touched.value"
            @update:model-value="confirmPassword.setValue"
            @blur="confirmPassword.setTouched()"
          />

          <FormButton
            type="submit"
            :disabled="form.isSubmitting.value || !form.isValid.value"
          >
            {{ form.isSubmitting.value ? 'Creating account...' : 'Create Account' }}
          </FormButton>

          <p class="registration-form__login">
            Already have an account?
            <NuxtLink
              to="/login"
              class="registration-form__link"
            >Sign in</NuxtLink>
          </p>
        </Form>

        <!-- Show login button when registration is successful -->
        <div
          v-if="showSuccessMessage"
          class="registration__success-actions"
        >
          <UIButton
            full-width
            @click="navigateTo('/login')"
          >
            Go to Login
          </UIButton>
        </div>
      </DevOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { registerSchema } from '~/utils/validation'

definePageMeta({
  middleware: 'guest',
})

const { register: createAccount, isLoggedIn } = useAuth()

// Success state
const showSuccessMessage = ref(false)

const form = useForm({
  schema: registerSchema,
  initialValues: {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  },
  onSubmit: async (values) => {
    try {
      await createAccount(values)

      // Show success message instead of redirecting
      showSuccessMessage.value = true
    }
    catch (error) {
      // Handle errors - display user-friendly error message
      console.error('Registration failed:', error)

      // Extract error message for display
      let errorMessage = 'An unexpected error occurred. Please try again.'

      if (error && typeof error === 'object') {
        if ('data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) {
          errorMessage = String(error.data.message)
        }
        else if ('message' in error) {
          errorMessage = String(error.message)
        }
      }

      // Set the form error to display to user
      form.setFormError(errorMessage)
    }
  },
})

const name = form.register('name', '')
const email = form.register('email', '')
const password = form.register('password', '')
const confirmPassword = form.register('confirmPassword', '')
</script>

<style scoped>
.registration-form__login {
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.875rem;
  color: var(--secondary-text-color);
}

.registration-form__link {
  color: var(--nnt-purple);
  text-decoration: none;
  font-weight: 500;
}

.registration-form__link:hover {
  text-decoration: underline;
}

.registration-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 50vh;
  padding: 1.5rem;
}

.registration {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border: var(--nnt-orange) solid 2px;
}

.registration__title {
  text-align: center;
  margin-bottom: 1.5rem;
  color: var(--primary-text-color);
  font-weight: 600;
}

.registration__content {
  width: 100%;
}

.registration__success-actions {
  text-align: center;
  margin-top: 1.5rem;
}
</style>
