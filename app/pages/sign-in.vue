<script setup lang="ts">
import * as z from 'zod'
import { normaliseEmail } from '#shared/utils/auth'
import { localPath } from '#shared/utils/local-path'
import { landingAfterSignIn } from '#shared/utils/night-authority'
import { wayInFor, withNext } from '#shared/utils/sign-in'
import type { FormError } from '@nuxt/ui'

// Somebody already signed in has nothing to do here, and typing a second set of details would
// make a second account by mistake (issue 925).
definePageMeta({ middleware: 'signed-out', docs: '/docs/getting-started/signing-in' })

const route = useRoute()
const { account, refresh } = useAccount()

// The Google route redirects here with a code rather than a sentence, so the wording lives on
// the page that shows it (A-104).
const REFUSALS: Record<string, string> = {
  'not-workspace': 'Only @newtheatre.org.uk accounts sign in with Google. Type any other address here instead.',
  'unverified-email': 'That Google account has an unverified address.',
  'account': 'That account cannot sign in. Ask the IT Manager.',
  'linked-elsewhere': 'That Google identity is already on another account. Those two need merging first.',
  'google': 'Google sign-in is unavailable at the moment.',
}

// A refused password keeps one wording for every cause, so the way on is said beside it (0103).
const LINK_INSTEAD = 'If your address is not confirmed yet, or the password escapes you, use Email me a sign-in link: it needs no password, and it confirms the address as it signs you in.'

type Step = 'address' | 'forgot' | 'challenge' | 'sent'

// An expired reset link asks for another on the step that sends one (issue 1152 item 1).
const step = ref<Step>(route.query.method === 'reset' ? 'forgot' : 'address')
const notice = ref<string | null>(null)
const sent = ref('')
const attemptId = ref('')
const working = ref<'link' | 'password' | 'passkey' | 'reset' | null>(null)

const refusal = computed(() => {
  const code = route.query.refused
  return typeof code === 'string' ? REFUSALS[code] ?? 'That sign-in was refused.' : null
})

const ADDRESS = z.string().trim().email()
const form = reactive({ email: '', password: '' })

// The address the offers are for, settled when the field is left or the form is sent rather than
// on each keystroke, so a theatre address never passes through a password field (0103, 0008).
const committed = ref<string | null>(null)
const way = computed(() => (committed.value === null ? null : wayInFor(committed.value)))

function commit(): void {
  const parsed = ADDRESS.safeParse(form.email)
  committed.value = parsed.success ? normaliseEmail(parsed.data) : null
}

const checkAddress = (state: Partial<typeof form>): FormError[] =>
  ADDRESS.safeParse(state.email ?? '').success ? [] : [{ name: 'email', message: 'Type your email address' }]

const checkPassword = (state: Partial<typeof form>): FormError[] =>
  state.password ? [] : [{ name: 'password', message: 'Type your password, or email yourself a sign-in link' }]

const googlePath = computed(() => withNext('/auth/google', route.query.next))
const registerPath = computed(() => withNext('/register', route.query.next))

// Focus that sat on a control the offers replaced moves to the first offer, as a next step would.
async function addressLeft(): Promise<void> {
  commit()
  await nextTick()
  const active = document.activeElement
  if (active && active !== document.body) return
  document.querySelector<HTMLElement>('[data-test="email-me-a-link"], [data-test="google-sign-in"]')?.focus()
}

async function proceed(): Promise<void> {
  commit()
  if (way.value === 'google') {
    await navigateTo(googlePath.value, { external: true })
    return
  }
  await nextTick()
  document.querySelector<HTMLElement>('[data-test="email-me-a-link"]')?.focus()
}

async function signIn(): Promise<void> {
  if (!committed.value) return
  notice.value = null
  working.value = 'password'
  try {
    const result = await $fetch('/api/auth/sign-in', { method: 'POST', body: { email: committed.value, password: form.password } })
    if (result.mfaRequired) {
      attemptId.value = result.attemptId
      step.value = 'challenge'
      return
    }
    await signedIn()
  }
  catch (error) {
    const text = refusalText(error)
    notice.value = refusalStatus(error) === 401 ? `${text}. ${LINK_INSTEAD}` : text
  }
  finally {
    working.value = null
  }
}

// The same answer whichever address is typed, so this screen cannot tell an attacker who holds
// an account (A-107 criterion 2, A-108 criterion 1).
async function ask(path: string, email: string, doing: 'link' | 'reset'): Promise<void> {
  notice.value = null
  working.value = doing
  try {
    const next = localPath(route.query.next) ?? undefined
    const result = await $fetch<{ message: string }>(path, { method: 'POST', body: { email, next } })
    sent.value = result.message
    step.value = 'sent'
  }
  catch (error) {
    notice.value = refusalText(error)
  }
  finally {
    working.value = null
  }
}

const emailLink = (): Promise<void> => (committed.value ? ask('/api/auth/magic-link/request', committed.value, 'link') : Promise.resolve())
const askForReset = (): Promise<void> => ask('/api/auth/password/forgot', normaliseEmail(form.email), 'reset')

// A passkey proves the person on the device, so it stands for both steps and no challenge
// follows it (A-105 criterion 2).
const { authenticate, isSupported } = useWebAuthn({ authenticateEndpoint: '/api/auth/passkey/authenticate' })
const suggestions = useWebAuthn({ authenticateEndpoint: '/api/auth/passkey/authenticate', useBrowserAutofill: true })
let suggesting = false

async function signInWithPasskey(): Promise<void> {
  working.value = 'passkey'
  notice.value = null
  try {
    await authenticate()
    await signedIn()
  }
  catch (error) {
    notice.value = refusalText(error)
  }
  finally {
    working.value = null
  }
}

// Asked for when the field is focused, not on load, so a visit that never reaches for it costs the
// server no challenge. Dismissing the suggestion, or pressing the button instead, says nothing.
async function suggestPasskeys(): Promise<void> {
  if (suggesting || !isSupported.value) return
  suggesting = true
  if (!await suggestions.isAutofillSupported()) return
  try {
    await suggestions.authenticate()
    await signedIn()
  }
  catch (error) {
    if (refusalStatus(error)) notice.value = refusalText(error)
  }
}

async function signedIn(): Promise<void> {
  await refresh()
  // An explicit next wins; with none, somebody on shift lands on Tonight (0094).
  await navigateTo(landingAfterSignIn(route.query.next, account.value.onShiftTonight))
}

function startAgain(): void {
  notice.value = null
  step.value = 'address'
}

useSeoMeta({ title: 'Sign in' })
</script>

<template>
  <WayIn>
    <div
      data-test="sign-in"
      class="space-y-6"
    >
      <UAlert
        v-if="refusal"
        color="error"
        variant="subtle"
        title="Not signed in"
        :description="refusal"
      />

      <UAlert
        v-if="notice"
        color="error"
        variant="subtle"
        :description="notice"
        data-test="sign-in-refused"
      />

      <template v-if="step === 'address'">
        <div class="space-y-1">
          <h1 class="nnt-headline text-xl text-highlighted">
            Sign in
          </h1>
          <p class="text-muted">
            Start with your email address.
          </p>
        </div>

        <UForm
          :state="form"
          :validate="checkAddress"
          data-test="address-form"
          class="space-y-4"
          @submit="proceed"
        >
          <UFormField
            label="Email address"
            name="email"
            required
          >
            <UInput
              v-model="form.email"
              type="email"
              autocomplete="username webauthn"
              size="xl"
              class="w-full"
              :ui="{ base: 'min-h-11' }"
              @change="addressLeft"
              @focus="suggestPasskeys"
            />
          </UFormField>
          <UButton
            v-if="way !== 'email'"
            type="submit"
            block
            size="xl"
            class="min-h-11"
            :icon="way === 'google' ? 'i-simple-icons-google' : undefined"
            :data-test="way === 'google' ? 'google-sign-in' : 'continue'"
          >
            {{ way === 'google' ? 'Continue with Google' : 'Continue' }}
          </UButton>
          <p
            v-if="way === 'google'"
            class="text-sm text-muted"
          >
            Theatre addresses sign in with Google and never hold a password.
          </p>
        </UForm>

        <template v-if="way === 'email'">
          <UButton
            block
            size="xl"
            class="min-h-11"
            icon="i-lucide-mail"
            :loading="working === 'link'"
            data-test="email-me-a-link"
            @click="emailLink"
          >
            Email me a sign-in link
          </UButton>

          <USeparator label="or use your password" />

          <UForm
            :state="form"
            :validate="checkPassword"
            data-test="password-form"
            class="space-y-4"
            @submit="signIn"
          >
            <UFormField
              label="Password"
              name="password"
              required
            >
              <UInput
                v-model="form.password"
                type="password"
                autocomplete="current-password"
                size="xl"
                class="w-full"
                :ui="{ base: 'min-h-11' }"
              />
            </UFormField>
            <UButton
              type="submit"
              block
              size="xl"
              color="neutral"
              variant="outline"
              class="min-h-11"
              :loading="working === 'password'"
            >
              Sign in
            </UButton>
          </UForm>

          <UButton
            variant="link"
            class="min-h-11 justify-start px-0"
            data-test="forgot-password"
            @click="step = 'forgot'"
          >
            I have forgotten my password
          </UButton>
        </template>

        <div class="flex flex-col items-start gap-1 border-t border-default pt-4">
          <UButton
            v-if="isSupported"
            icon="i-lucide-fingerprint"
            color="neutral"
            variant="subtle"
            block
            class="mb-2 min-h-11"
            :loading="working === 'passkey'"
            data-test="passkey-sign-in"
            @click="signInWithPasskey"
          >
            Use a passkey
          </UButton>
          <UButton
            variant="link"
            class="min-h-11 justify-start px-0"
            :to="registerPath"
          >
            I do not have an account yet
          </UButton>
        </div>
      </template>

      <template v-else-if="step === 'forgot'">
        <div class="space-y-1">
          <h1 class="nnt-headline text-xl text-highlighted">
            Forgotten password
          </h1>
          <p class="text-muted">
            We will email a link to set a new one. Setting it signs you in.
          </p>
        </div>

        <UForm
          :state="form"
          :validate="checkAddress"
          class="space-y-4"
          @submit="askForReset"
        >
          <UFormField
            label="Email address"
            name="email"
            required
          >
            <UInput
              v-model="form.email"
              type="email"
              autocomplete="username"
              size="xl"
              class="w-full"
              :ui="{ base: 'min-h-11' }"
            />
          </UFormField>
          <UButton
            type="submit"
            block
            size="xl"
            class="min-h-11"
            :loading="working === 'reset'"
          >
            Send a reset link
          </UButton>
        </UForm>

        <UButton
          variant="link"
          class="min-h-11 justify-start px-0"
          @click="startAgain"
        >
          Back to signing in
        </UButton>
      </template>

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
        <UButton
          variant="link"
          class="min-h-11 justify-start px-0"
          @click="startAgain"
        >
          Back to signing in
        </UButton>
      </div>
    </div>
  </WayIn>
</template>
