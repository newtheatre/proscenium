<script setup lang="ts">
import * as z from 'zod'
import type { AuthFormField, ButtonProps, FormSubmitEvent } from '@nuxt/ui'

const route = useRoute()
const { refresh } = useAccount()

// The Google route redirects here with a code rather than a sentence, so the wording lives on
// the page that shows it (A-104).
const REFUSALS: Record<string, string> = {
  'not-workspace': 'Only @newtheatre.org.uk accounts sign in with Google. Members use an email address and password.',
  'unverified-email': 'That Google account has an unverified address.',
  'disabled': 'That account cannot sign in. Ask the IT Manager.',
  'linked-elsewhere': 'That Google identity is already on another account. Those two need merging first.',
  'google': 'Google sign-in is unavailable at the moment.',
}

type Step = 'credentials' | 'forgot' | 'link' | 'challenge' | 'sent'

const step = ref<Step>('credentials')
const notice = ref<string | null>(null)
const sent = ref('')
const attemptId = ref('')

const refusal = computed(() => {
  const code = route.query.refused
  return typeof code === 'string' ? REFUSALS[code] ?? 'That sign-in was refused.' : null
})

const credentials = z.object({
  email: z.string().email('Enter an email address'),
  password: z.string().min(1, 'Enter your password'),
})

const addressOnly = z.object({ email: z.string().email('Enter an email address') })

const credentialFields: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email address', autocomplete: 'email', required: true },
  { name: 'password', type: 'password', label: 'Password', autocomplete: 'current-password', required: true },
]

const addressField: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email address', autocomplete: 'email', required: true },
]

const providers: ButtonProps[] = [
  { label: 'Sign in with Google', icon: 'i-simple-icons-google', to: '/auth/google', external: true },
]

async function signIn(payload: FormSubmitEvent<z.output<typeof credentials>>): Promise<void> {
  notice.value = null
  try {
    const result = await $fetch('/api/auth/sign-in', { method: 'POST', body: payload.data })
    if (result.mfaRequired) {
      attemptId.value = result.attemptId
      step.value = 'challenge'
      return
    }
    await signedIn()
  }
  catch (error) {
    notice.value = refusalText(error)
  }
}

// The same answer whichever address is typed, so this screen cannot tell an attacker who holds
// an account (A-108 criterion 1).
async function ask(path: string, payload: FormSubmitEvent<z.output<typeof addressOnly>>): Promise<void> {
  notice.value = null
  try {
    const result = await $fetch<{ message: string }>(path, { method: 'POST', body: payload.data })
    sent.value = result.message
    step.value = 'sent'
  }
  catch (error) {
    notice.value = refusalText(error)
  }
}

// Only a path on this site: an absolute URL here would make the sign-in screen an open redirect.
const nextPath = computed(() => {
  const next = route.query.next
  return typeof next === 'string' && /^\/(?!\/)/.test(next) ? next : '/'
})

async function signedIn(): Promise<void> {
  await refresh()
  await navigateTo(nextPath.value)
}

useSeoMeta({ title: 'Sign in' })
</script>

<template>
  <UContainer class="max-w-md py-16">
    <UPageCard>
      <UAlert
        v-if="refusal"
        class="mb-6"
        color="error"
        variant="subtle"
        title="Not signed in"
        :description="refusal"
      />

      <UAlert
        v-if="notice"
        class="mb-6"
        color="error"
        variant="subtle"
        :description="notice"
      />

      <UAuthForm
        v-if="step === 'credentials'"
        title="Sign in"
        description="Committee accounts on @newtheatre.org.uk sign in with Google. Everyone else uses an email address and a password."
        :schema="credentials"
        :fields="credentialFields"
        :providers="providers"
        :submit="{ label: 'Sign in' }"
        @submit="signIn"
      >
        <template #footer>
          <div class="flex flex-col items-start gap-1">
            <UButton
              variant="link"
              class="px-0"
              @click="step = 'forgot'"
            >
              I have forgotten my password
            </UButton>
            <UButton
              variant="link"
              class="px-0"
              to="/register"
            >
              I do not have an account yet
            </UButton>
          </div>
        </template>
      </UAuthForm>

      <UAuthForm
        v-else-if="step === 'forgot'"
        title="Forgotten password"
        description="We will send a link to set a new one."
        :schema="addressOnly"
        :fields="addressField"
        :submit="{ label: 'Send a reset link' }"
        @submit="ask('/api/auth/password/forgot', $event)"
      >
        <template #footer>
          <div class="flex flex-col items-start gap-1">
            <UButton
              variant="link"
              class="px-0"
              @click="step = 'link'"
            >
              Email me a sign-in link instead
            </UButton>
            <UButton
              variant="link"
              class="px-0"
              @click="step = 'credentials'"
            >
              Back to signing in
            </UButton>
          </div>
        </template>
      </UAuthForm>

      <UAuthForm
        v-else-if="step === 'link'"
        title="Sign-in link"
        description="We will email a link that signs you in without a password."
        :schema="addressOnly"
        :fields="addressField"
        :submit="{ label: 'Send a sign-in link' }"
        @submit="ask('/api/auth/magic-link/request', $event)"
      >
        <template #footer>
          <UButton
            variant="link"
            class="px-0"
            @click="step = 'credentials'"
          >
            Back to signing in
          </UButton>
        </template>
      </UAuthForm>

      <MfaChallenge
        v-else-if="step === 'challenge'"
        :attempt-id="attemptId"
        @answered="signedIn"
      />

      <div
        v-else
        data-test="check-your-email"
        class="space-y-2"
      >
        <h1 class="nnt-headline text-xl">
          Check your email
        </h1>
        <p class="text-muted">
          {{ sent }}
        </p>
      </div>
    </UPageCard>
  </UContainer>
</template>
