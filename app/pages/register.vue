<template>
  <Form
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
  </Form>
</template>

<script setup lang="ts">
import { registerSchema } from '~/utils/validation'

definePageMeta({
  middleware: 'guest',
})

const { register: createAccount } = useAuth()

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
      await navigateTo('/')
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
