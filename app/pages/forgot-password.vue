<template>
  <UContainer class="flex flex-col items-center justify-center gap-4 p-4 min-h-[calc(100vh-var(--ui-header-height))]">
    <UPageCard
      class="w-full max-w-md"
      highlight
      highlight-color="secondary"
    >
      <UAuthForm
        v-if="!successMessage"
        :schema="schema"
        :fields="fields"
        title="Forgot Password"
        description="Enter your email address and we'll send you a link to reset your password."
        icon="i-lucide-key-round"
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
          Remember your password?
          <ULink
            to="/login"
            class="text-primary font-medium"
          >
            Sign in
          </ULink>
        </template>
      </UAuthForm>

      <div
        v-else
        class="flex flex-col items-center gap-6 p-6"
      >
        <UIcon
          name="i-lucide-circle-check"
          class="size-16 text-success"
        />

        <div class="text-center space-y-2">
          <h1 class="text-2xl font-bold">
            Check your email
          </h1>
          <p class="text-muted">
            {{ successMessage }}
          </p>
        </div>

        <UButton
          label="Back to Login"
          to="/login"
          block
        />
      </div>
    </UPageCard>
  </UContainer>
</template>

<script lang="ts" setup>
import z from 'zod/v4'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  middleware: 'guest',
  title: 'Forgot Password',
  description: 'Reset your password',
})

const errorMessage = ref<string>('')
const successMessage = ref<string>('')

const schema = z.object({
  email: z.email('Please enter a valid email address'),
})

type Schema = z.output<typeof schema>

const fields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email' as const,
    label: 'Email',
    placeholder: 'Enter your email address',
    required: true,
    autocomplete: 'email',
  },
]

async function onSubmit(event: FormSubmitEvent<Schema>) {
  errorMessage.value = ''
  successMessage.value = ''

  try {
    const response = await $fetch('/api/auth/password/forgot', {
      method: 'POST',
      body: {
        email: event.data.email,
      },
    })

    successMessage.value = response.message || 'Password reset email sent! Please check your inbox.'
  }
  catch (error) {
    errorMessage.value = getErrorMessage(error, 'An unexpected error occurred. Please try again.')
  }
}
</script>
