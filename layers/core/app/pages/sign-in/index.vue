<!-- Sign in (ID-01, ID-02, ID-04, ID-07): a passkey first, an emailed link and code, or Google. -->
<script setup lang="ts">
import type { Refusal } from '../../utils/identity'

// Someone already signed in is sent on before the page is made. The page reads the same answer.
definePageMeta({
  middleware: async (to) => {
    const { data } = await useAPI<{ signedIn: boolean }>('/api/core/me', { key: 'core:me' })
    if (data.value?.signedIn) return navigateTo(nextPath(to.query.next) ?? '/')
  },
})
useSeoMeta({ title: 'Sign in' })
const route = useRoute()
const next = nextPath(route.query.next)
const refusal = ref<Refusal | null>(null)
const busy = ref(false)
const address = ref('')
const code = ref('')
const challenge = ref('')
const sent = ref(false)
const { data: me } = useNuxtData<{ signedIn: boolean, signIn?: { email: boolean, google: boolean } }>('core:me')
const errorCode = typeof route.query.error === 'string' ? route.query.error : null
const providerErrors: Record<string, string> = {
  'core.sign-in.provider-unverified': 'Google has not confirmed this account\'s email address. Confirm it with Google, or sign in another way.',
  'core.sign-in.provider-domain': 'That Google account is not from an organisation that can sign in here. Choose another account.',
  'core.sign-in.provider-cancelled': 'Google sign-in was cancelled.',
  'core.sign-in.closed': 'This theatre is not taking new accounts at the moment.',
  'core.account.disabled': 'This account is disabled. Contact the theatre to find out why.',
}
const providerError = errorCode ? (providerErrors[errorCode] ?? 'Google did not confirm who you are. Try again.') : null
const googleHref = `/api/core/sign-in/google${next ? `?next=${encodeURIComponent(next)}` : ''}`

function arrive(target: { next: string, offerPasskey?: boolean }) {
  if (target.offerPasskey) return navigateTo({ path: '/account/passkey', query: { next: target.next } })
  return navigateTo(target.next)
}

async function withPasskey() {
  busy.value = true
  refusal.value = null
  const answer = await provePasskey<{ next: string }>('/api/core/sign-in/passkey/options', '/api/core/sign-in/passkey', next ? { next } : {})
  busy.value = false
  if (answer.ok) return arrive(answer.data)
  refusal.value = answer.refusal
}

async function sendLink() {
  busy.value = true
  refusal.value = null
  const answer = await callIdentity<{ sent?: true, provider?: string, to?: string }>('/api/core/sign-in/email', { address: address.value, ...(next ? { next } : {}) }, { 'cf-turnstile-response': challenge.value })
  busy.value = false
  if (!answer.ok) {
    refusal.value = answer.refusal
    return
  }
  if (answer.data.to) return navigateTo(answer.data.to, { external: true })
  sent.value = true
}

async function useCode() {
  busy.value = true
  refusal.value = null
  const answer = await callIdentity<{ next: string, offerPasskey: boolean }>('/api/core/sign-in/code', { address: address.value, code: code.value })
  busy.value = false
  if (answer.ok) return arrive(answer.data)
  refusal.value = answer.refusal
}
</script>

<template>
  <IdentityCard :title="sent ? 'Check your email' : 'Sign in'">
    <UAlert
      v-if="providerError"
      role="alert"
      color="error"
      :title="providerError"
    />
    <RefusalNotice :refusal="refusal" />

    <template v-if="!sent">
      <UButton
        block
        size="lg"
        icon="i-lucide-key-round"
        :loading="busy"
        @click="withPasskey"
      >
        Sign in with a passkey
      </UButton>
      <UButton
        v-if="me?.signIn?.google"
        block
        color="neutral"
        variant="outline"
        :href="googleHref"
        external
      >
        Sign in with Google
      </UButton>
      <template v-if="me?.signIn?.email">
        <USeparator label="or" />
        <UForm
          :state="{ address }"
          class="flex flex-col gap-4"
          @submit="sendLink"
        >
          <UFormField
            label="Get a sign-in link by email"
            name="address"
          >
            <UInput
              v-model="address"
              type="email"
              autocomplete="email webauthn"
              required
            />
          </UFormField>
          <TurnstileCheck @token="challenge = $event" />
          <UButton
            type="submit"
            block
            color="neutral"
            :loading="busy"
          >
            Email me a link
          </UButton>
        </UForm>
      </template>
    </template>

    <template v-else>
      <p class="text-sm text-muted">
        If {{ address }} can sign in here, we have sent it a link and a six-digit code. The link works in this browser; the code works anywhere.
      </p>
      <UForm
        :state="{ code }"
        class="flex flex-col gap-4"
        @submit="useCode"
      >
        <UFormField
          label="Six-digit code"
          name="code"
        >
          <UInput
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            required
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="busy"
        >
          Sign in
        </UButton>
      </UForm>
      <UButton
        variant="link"
        color="neutral"
        @click="sent = false"
      >
        Use a different address
      </UButton>
    </template>
  </IdentityCard>
</template>
