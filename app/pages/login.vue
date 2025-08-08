<template>
  <Form
    :error="form.formError.value"
    @submit="form.handleSubmit"
  >
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
      autocomplete="current-password"
      placeholder="Enter your password"
      :error="password.error.value"
      :touched="password.touched.value"
      @update:model-value="password.setValue"
      @blur="password.setTouched()"
    />

    <FormButton
      type="submit"
      :disabled="form.isSubmitting.value || !form.isValid.value"
    >
      {{ form.isSubmitting.value ? 'Signing in...' : 'Sign In' }}
    </FormButton>
  </Form>
</template>

<script setup lang="ts">
import { loginSchema } from '~/utils/validation'

definePageMeta({
  middleware: 'guest',
})

const { login } = useAuth()

const form = useForm({
  schema: loginSchema,
  initialValues: {
    email: '',
    password: '',
  },
  onSubmit: async (values) => {
    try {
      // Call your authentication API
      await login(values)

      // Redirect on success
      await navigateTo('/')
    }
    catch (error) {
      // Handle errors - display user-friendly error message
      console.error('Login failed:', error)

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

// Ensure fields are properly initialized
const email = form.register('email', '')
const password = form.register('password', '')
</script>
