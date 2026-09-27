<script setup lang="ts">
import * as z from 'zod'
import { passwordProblem } from '#shared/utils/auth'
import { landingAfterSignIn } from '#shared/utils/night-authority'
import { saysPasswordPolicy } from '#shared/utils/password-messages'
import { withNext } from '#shared/utils/sign-in'
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

const route = useRoute()
const policy = usePasswordPolicy()
const { account, refresh } = useAccount()
const toast = useToast()

// A link from the console sets a first password rather than replacing one, and claims a token of
// its own kind (A-121 criterion 3).
const settingFirst = computed(() => route.query.kind === 'set')
const tokenKind = computed(() => (settingFirst.value ? 'SET_PASSWORD' : 'PASSWORD_RESET'))

type Outcome = 'choosing' | 'challenge' | 'expired'

const outcome = ref<Outcome>('choosing')
const notice = ref('')
const attemptId = ref('')

const schema = z.object({ password: z.string().min(1, 'Choose a password') })

const fields: AuthFormField[] = [
  {
    name: 'password',
    type: 'password',
    label: 'New password',
    autocomplete: 'new-password',
    description: saysPasswordPolicy(policy.value),
    required: true,
  },
]

// The address the token belongs to is not on this screen, so the Workspace rule cannot be
// checked here; the route refuses it and the message is shown as written.
function checkPassword(state: Partial<z.output<typeof schema>>): FormError[] {
  const problem = state.password ? passwordProblem('', state.password, policy.value) : null
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
    const result = await $fetch('/api/auth/password/reset', { method: 'POST', body: { token, password: payload.data.password, kind: tokenKind.value } })
    if (result.mfaRequired) {
      attemptId.value = result.attemptId
      outcome.value = 'challenge'
      return
    }
    await signedIn()
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

// Choosing the password is the sign-in, so nobody types it again straight after (0103).
async function signedIn(): Promise<void> {
  await refresh()
  toast.add({ title: 'Password set', description: 'Every other session on your account has ended.', color: 'success' })
  await navigateTo(landingAfterSignIn(route.query.next, account.value.onShiftTonight))
}

useSeoMeta({ title: 'Set a new password' })
</script>

<template>
  <WayIn>
    <UAlert
      v-if="notice && outcome === 'choosing'"
      class="mb-6"
      color="error"
      variant="subtle"
      :description="notice"
    />

    <UAuthForm
      v-if="outcome === 'choosing'"
      :title="settingFirst ? 'Choose your password' : 'Set a new password'"
      :description="settingFirst ? 'We made you an account. Choose a password and you are signed in.' : 'Setting a new password signs you in here and out everywhere else.'"
      :schema="schema"
      :fields="fields"
      :validate="checkPassword"
      :submit="{ label: 'Set my password', class: 'min-h-11' }"
      @submit="reset"
    />

    <MfaChallenge
      v-else-if="outcome === 'challenge'"
      :attempt-id="attemptId"
      @answered="signedIn"
    />

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
      <UButton
        :to="withNext('/sign-in?method=reset', route.query.next)"
        class="min-h-11"
        data-test="ask-again"
      >
        Ask for a new one
      </UButton>
    </div>
  </WayIn>
</template>
