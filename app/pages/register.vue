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
        title="Create Account"
        icon="i-lucide-user-plus"
        @submit="onSubmit"
      >
        <template #validation>
          <UAlert
            v-if="errorMessage"
            color="error"
            icon="i-lucide-alert-circle"
            :title="errorMessage"
          />
        </template>

        <template #footer>
          Already have an account?
          <ULink
            to="/login"
            class="text-primary font-medium"
          >
            Sign in
          </ULink>
        </template>
      </UAuthForm>
    </UPageCard>
  </UContainer>
</template>

<script lang="ts" setup>
import z from 'zod/v4'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

const { fetch: refreshSession } = useUserSession()

definePageMeta({
  middleware: 'guest',
  title: 'Register',
  description: 'Create your account',
})

const errorMessage = ref<string>('')

const schema = z.object({
  name: z.string('Name is required'),
  email: z
    .email('Please enter a valid email address'),
  password: z
    .string('Password is required')
    .min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string('Please confirm your password'),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type Schema = z.output<typeof schema>

const fields: AuthFormField[] = [
  {
    name: 'name',
    type: 'text' as const,
    label: 'Full Name',
    placeholder: 'Enter your full name',
    required: true,
    autocomplete: 'name',
  },
  {
    name: 'email',
    type: 'email' as const,
    label: 'Email',
    placeholder: 'Enter your email address',
    required: true,
    autocomplete: 'email',
  },
  {
    name: 'password',
    type: 'password' as const,
    label: 'Password',
    placeholder: 'Enter your password',
    required: true,
    autocomplete: 'new-password',
  },
  {
    name: 'confirmPassword',
    type: 'password' as const,
    label: 'Confirm Password',
    placeholder: 'Confirm your password',
    required: true,
    autocomplete: 'new-password',
  },
]

async function onSubmit(event: FormSubmitEvent<Schema>) {
  errorMessage.value = ''

  try {
    const { name, email, password } = event.data
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: { name, email, password },
    })
    await refreshSession()
    await navigateTo('/')
  }
  catch (error) {
    errorMessage.value = getErrorMessage(error, 'An unexpected error occurred. Please try again.')
  }
}
</script>

<style>

</style>
