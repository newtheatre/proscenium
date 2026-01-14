<template>
  <UContainer class="flex flex-col items-center justify-center gap-4 p-4 min-h-[calc(100vh-var(--ui-header-height))]">
    <UPageCard
      class="w-full max-w-md"
      highlight
      highlight-color="secondary"
    >
      <UAuthForm
        :schema="schema"
        :fields="fields"
        title="Reset Password"
        description="Enter your new password below."
        icon="i-lucide-lock-keyhole"
        @submit="onSubmit"
      >
        <template #validation>
          <UAlert
            v-if="successMessage"
            color="success"
            icon="i-lucide-circle-check"
            :title="successMessage"
          />
          <UAlert
            v-else-if="errorMessage"
            color="error"
            icon="i-lucide-alert-circle"
            :title="errorMessage"
          />
        </template>

        <template #submit="{ loading }">
          <UButton
            v-if="!successMessage"
            type="submit"
            label="Reset Password"
            :loading="loading"
            block
          />
          <UButton
            v-else
            label="Go to Login"
            to="/login"
            block
          />
        </template>

        <template #footer>
          <template v-if="!successMessage">
            Remember your password?
            <ULink
              to="/login"
              class="text-primary font-medium"
            >
              Sign in
            </ULink>
          </template>
        </template>
      </UAuthForm>
    </UPageCard>
  </UContainer>
</template>

<script lang="ts" setup>
import z from 'zod/v4'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  middleware: 'guest',
  title: 'Reset Password',
  description: 'Create a new password',
})

const route = useRoute()
const token = route.query.token as string | undefined

const errorMessage = ref<string>(token ? '' : 'Invalid reset link. Please request a new password reset.')
const successMessage = ref<string>('')

const schema = z.object({
  password: z
    .string('Password is required')
    .min(8, 'Password must be at least 8 characters')
    .refine(val => /[a-z]/.test(val), { message: 'Password must contain at least one lowercase letter' })
    .refine(val => /[A-Z]/.test(val), { message: 'Password must contain at least one uppercase letter' })
    .refine(val => /\d/.test(val), { message: 'Password must contain at least one number' }),
  confirmPassword: z.string('Please confirm your password'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type Schema = z.output<typeof schema>

const fields: AuthFormField[] = [
  {
    name: 'password',
    type: 'password' as const,
    label: 'New Password',
    placeholder: 'Enter your new password',
    required: true,
    autocomplete: 'new-password',
  },
  {
    name: 'confirmPassword',
    type: 'password' as const,
    label: 'Confirm Password',
    placeholder: 'Confirm your new password',
    required: true,
    autocomplete: 'new-password',
  },
]

async function onSubmit(event: FormSubmitEvent<Schema>) {
  errorMessage.value = ''
  successMessage.value = ''

  if (!token) {
    errorMessage.value = 'Invalid reset link. Please request a new password reset.'
    return
  }

  try {
    const response = await $fetch('/api/auth/password/reset', {
      method: 'POST',
      body: {
        token,
        password: event.data.password,
      },
    })

    successMessage.value = response.message || 'Password reset successful! You can now log in with your new password.'
  }
  catch (error) {
    if (error instanceof Error) {
      errorMessage.value = error.message
    }
    else {
      errorMessage.value = 'An unexpected error occurred. Please try again.'
    }
  }
}
</script>
