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
        title="Login"
        icon="i-lucide-circle-user-round"
        @submit="onSubmit"
      >
        <template #password-hint>
          <ULink
            to="/password-reset"
            class="text-primary font-medium"
            tabindex="-1"
          >
            Forgot password?
          </ULink>
        </template>

        <template #validation>
          <UAlert
            v-if="errorMessage"
            color="error"
            icon="i-lucide-alert-circle"
            :title="errorMessage"
          />
        </template>

        <template #footer>
          Don't have an account?
          <ULink
            to="/register"
            class="text-primary font-medium"
          >
            Sign up
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
  title: 'Login',
  description: 'Sign in to your account',
})

const errorMessage = useState('login-error-message', () => '')

const schema = z.object({
  email: z
    .email('Please enter a valid email address'),
  password: z
    .string('Password is required')
    .min(8, 'Password must be at least 8 characters'),
  // remember: z.boolean().optional(),
})

type Schema = z.output<typeof schema>

const fields: AuthFormField[] = [
  {
    name: 'email',
    type: 'text' as const,
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
    autocomplete: 'current-password',
  },
  // {
  //   name: 'remember',
  //   type: 'checkbox' as const,
  //   label: 'Remember me',
  // },
]

async function onSubmit(event: FormSubmitEvent<Schema>) {
  errorMessage.value = ''

  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: event.data,
    })
    await refreshSession()
    await navigateTo('/')
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

<style>

</style>
