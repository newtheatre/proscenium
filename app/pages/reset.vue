<script setup lang="ts">
import * as z from 'zod'
import { defaultPasswordPolicy, passwordProblem } from '#shared/utils/auth'
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

const route = useRoute()
const policy = defaultPasswordPolicy()

type Outcome = 'choosing' | 'done' | 'expired'

const outcome = ref<Outcome>('choosing')
const notice = ref('')

const schema = z.object({ password: z.string().min(1, 'Choose a password') })

const fields: AuthFormField[] = [
  {
    name: 'password',
    type: 'password',
    label: 'New password',
    autocomplete: 'new-password',
    description: `At least ${policy.minLength} characters.`,
    required: true,
  },
]

// The address the token belongs to is not on this screen, so the Workspace rule cannot be
// checked here; the route refuses it and the message is shown as written.
function checkPassword(state: Partial<z.output<typeof schema>>): FormError[] {
  const problem = state.password ? passwordProblem('', state.password, policy) : null
  return problem ? [{ name: 'password', message: explainPasswordProblem(problem) }] : []
}

async function reset(payload: FormSubmitEvent<z.output<typeof schema>>): Promise<void> {
  notice.value = ''
  const token = route.query.token
  if (typeof token !== 'string' || !token) {
    outcome.value = 'expired'
    notice.value = 'That link is incomplete. Ask for a new one.'
    return
  }

  try {
    await $fetch('/api/auth/password/reset', { method: 'POST', body: { token, password: payload.data.password } })
    outcome.value = 'done'
  }
  catch (error) {
    const text = refusalText(error)
    // A refused password is worth another attempt; a refused token is not.
    if ((error as { status?: number, statusCode?: number }).status === 400) notice.value = text
    else {
      notice.value = text
      outcome.value = 'expired'
    }
  }
}

useSeoMeta({ title: 'Set a new password' })
</script>

<template>
  <UContainer class="max-w-md py-16">
    <UPageCard>
      <UAlert
        v-if="notice && outcome === 'choosing'"
        class="mb-6"
        color="error"
        variant="subtle"
        :description="notice"
      />

      <UAuthForm
        v-if="outcome === 'choosing'"
        title="Set a new password"
        description="Setting a new password signs you out everywhere else."
        :schema="schema"
        :fields="fields"
        :validate="checkPassword"
        :submit="{ label: 'Set my password' }"
        @submit="reset"
      />

      <div
        v-else-if="outcome === 'done'"
        data-test="reset-done"
        class="space-y-3"
      >
        <h1 class="nnt-headline text-xl">
          Password set
        </h1>
        <p class="text-muted">
          Every other session on your account has ended. Sign in with the new password.
        </p>
        <UButton to="/sign-in">
          Sign in
        </UButton>
      </div>

      <div
        v-else
        data-test="token-expired"
        class="space-y-3"
      >
        <h1 class="nnt-headline text-xl">
          That link has expired
        </h1>
        <p class="text-muted">
          {{ notice }}
        </p>
        <UButton to="/sign-in">
          Ask for a new one
        </UButton>
      </div>
    </UPageCard>
  </UContainer>
</template>
