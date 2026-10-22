<script setup lang="ts">
import type * as z from 'zod'
import { passwordProblem } from '#shared/utils/auth'
import { saysPasswordPolicy } from '#shared/utils/password-messages'
import { registerForm, withNext } from '#shared/utils/sign-in'
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

// Somebody already signed in has nothing to do here, and typing a second set of details would
// make a second account by mistake (issue 925).
definePageMeta({ middleware: 'signed-out' })

const route = useRoute()
const policy = usePasswordPolicy()

const schema = registerForm

const fields: AuthFormField[] = [
  { name: 'name', type: 'text', label: 'Name', autocomplete: 'name', required: true },
  { name: 'email', type: 'email', label: 'Email address', autocomplete: 'email', required: true },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    autocomplete: 'new-password',
    description: saysPasswordPolicy(policy.value),
    required: true,
  },
]

const message = ref('')
const done = ref(false)
const notice = ref<string | null>(null)
const working = ref(false)
const registered = ref('')
const resent = ref<string | null>(null)

// A click before the page hydrates would be lost without a word, so the button waits for it.
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})

// One rule for the browser and the server: the same function decides both (0012).
function checkPassword(state: Partial<z.output<typeof schema>>): FormError[] {
  const problem = state.password ? passwordProblem(state.email ?? '', state.password, policy.value) : null
  return problem ? [{ name: 'password', message: explainPasswordProblem(problem) }] : []
}

async function register(payload: FormSubmitEvent<z.output<typeof schema>>): Promise<void> {
  notice.value = null
  working.value = true
  try {
    // The confirmation link returns to where the visitor set out from (0103).
    const result = await $fetch('/api/auth/register', { method: 'POST', body: { ...payload.data, next: route.query.next } })
    message.value = result.message
    registered.value = payload.data.email
    done.value = true
  }
  catch (error) {
    notice.value = refusalText(error)
  }
  finally {
    working.value = false
  }
}

// A lost or slow message is the commonest dead end here, so the page offers another (A-102).
async function sendAgain(): Promise<void> {
  working.value = true
  try {
    const result = await $fetch('/api/auth/verify/resend', { method: 'POST', body: { email: registered.value, next: route.query.next } })
    resent.value = result.message
  }
  catch (error) {
    resent.value = refusalText(error)
  }
  finally {
    working.value = false
  }
}

useSeoMeta({ title: 'Create an account' })
</script>

<template>
  <WayIn>
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
      :submit="{ label: 'Create my account', disabled: !hydrated, loading: working }"
      @submit="register"
    >
      <template #title>
        <h1 class="nnt-headline text-xl text-highlighted">
          Create an account
        </h1>
      </template>
      <template #footer>
        <UButton
          variant="link"
          class="min-h-11 justify-start px-0"
          :to="withNext('/sign-in', route.query.next)"
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
        Follow the link in the message to confirm your address. Open it in this browser and you are
        signed in straight away; opened anywhere else, such as on your phone, you sign in there.
      </p>
      <UButton
        variant="link"
        class="min-h-11 justify-start px-0"
        data-test="resend-verification"
        :loading="working"
        @click="sendAgain"
      >
        Nothing arrived? Send the link again
      </UButton>
      <p
        v-if="resent"
        data-test="resent"
        class="text-sm text-muted"
      >
        {{ resent }}
      </p>
      <p
        class="text-sm text-muted"
        data-test="register-known-address"
      >
        If we already knew this address, from a booking or a training record, the message asks you to
        choose a password instead, and the one typed here is not kept.
      </p>
    </div>
  </WayIn>
</template>
