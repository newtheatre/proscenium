<template>
  <div style="max-width: 400px; margin: 2rem auto; padding: 2rem;">
    <h1>Form Test</h1>

    <Form @submit="form.handleSubmit">
      <FormInput
        id="test-email"
        :model-value="email.value.value"
        label="Email (required)"
        type="email"
        placeholder="Enter your email"
        :error="email.error.value"
        :touched="email.touched.value"
        @update:model-value="email.setValue"
        @blur="email.setTouched()"
      />

      <FormInput
        id="test-password"
        :model-value="password.value.value"
        label="Password (min 8 chars)"
        type="password"
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
        {{ form.isSubmitting.value ? 'Submitting...' : 'Submit' }}
      </FormButton>
    </Form>

    <div style="margin-top: 2rem; padding: 1rem; background: #f3f4f6; border-radius: 0.375rem;">
      <h3>Debug Info:</h3>
      <p><strong>Form Valid:</strong> {{ form.isValid.value }}</p>
      <p><strong>Form Touched:</strong> {{ form.isTouched.value }}</p>
      <p><strong>Email Value:</strong> "{{ email.value.value }}"</p>
      <p><strong>Email Error:</strong> {{ email.error.value || 'None' }}</p>
      <p><strong>Email Touched:</strong> {{ email.touched.value }}</p>
      <p><strong>Password Value:</strong> "{{ password.value.value }}"</p>
      <p><strong>Password Error:</strong> {{ password.error.value || 'None' }}</p>
      <p><strong>Password Touched:</strong> {{ password.touched.value }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'

const testSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const form = useForm({
  schema: testSchema,
  initialValues: {
    email: '',
    password: '',
  },
  onSubmit: async (values) => {
    console.log('Form submitted with values:', values)
    alert('Form submitted successfully!')
  },
})

const email = form.register('email', '')
const password = form.register('password', '')
</script>
