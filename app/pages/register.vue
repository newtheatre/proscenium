<script setup lang="ts">
import * as z from 'zod'
import { passwordProblem } from '#shared/utils/auth'
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

const policy = usePasswordPolicy()

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(200, 'That name is too long'),
  email: z.string().email('Enter an email address'),
  password: z.string().min(1, 'Choose a password'),
})

const fields: AuthFormField[] = [
  { name: 'name', type: 'text', label: 'Name', autocomplete: 'name', required: true },
  { name: 'email', type: 'email', label: 'Email address', autocomplete: 'email', required: true },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    autocomplete: 'new-password',
    description: `At least ${policy.value.minLength} characters. Length beats punctuation, so a few words you will remember is a good password.`,
    required: true,
  },
]

const message = ref('')
const done = ref(false)
const notice = ref<string | null>(null)

// One rule for the browser and the server: the same function decides both (0012).
function checkPassword(state: Partial<z.output<typeof schema>>): FormError[] {
  const problem = state.password ? passwordProblem(state.email ?? '', state.password, policy.value) : null
  return problem ? [{ name: 'password', message: explainPasswordProblem(problem) }] : []
}

async function register(payload: FormSubmitEvent<z.output<typeof schema>>): Promise<void> {
  notice.value = null
  try {
    const result = await $fetch('/api/auth/register', { method: 'POST', body: payload.data })
    message.value = result.message
    done.value = true
  }
  catch (error) {
    notice.value = refusalText(error)
  }
}

useSeoMeta({ title: 'Create an account' })
</script>

<template>
  <UContainer class="max-w-md py-16">
    <UPageCard>
      <UAlert
        v-if="notice"
        class="mb-6"
        color="error"
        variant="subtle"
        :description="notice"
      />

      <UAuthForm
        v-if="!done"
        title="Create an account"
        description="One account covers tickets, rehearsal rooms, training and shifts."
        :schema="schema"
        :fields="fields"
        :validate="checkPassword"
        :submit="{ label: 'Create my account' }"
        @submit="register"
      >
        <template #footer>
          <UButton
            variant="link"
            class="px-0"
            to="/sign-in"
          >
            I already have an account
          </UButton>
        </template>
      </UAuthForm>

      <div
        v-else
        data-test="check-your-email"
        class="space-y-3"
      >
        <h1 class="nnt-headline text-xl">
          Check your email
        </h1>
        <p class="text-muted">
          {{ message }}
        </p>
        <p class="text-sm text-muted">
          Registering does not sign you in. Follow the link in the message to confirm your address,
          and you are done.
        </p>
      </div>
    </UPageCard>
  </UContainer>
</template>
