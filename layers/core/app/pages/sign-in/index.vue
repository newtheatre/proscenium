<!-- Sign in (ID-01, ID-02, ID-04, ID-07): a passkey first, an emailed link and code, or an outside
     provider the theatre has switched on (Google so far), one button each. -->
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
const CODE_LENGTH = 6 // not-policy: the length of the code the server sends
// One box a digit; the request takes them as one string.
const digits = ref<number[]>([])
const code = computed(() => digits.value.join(''))
const challenge = ref('')
const sent = ref(false)
const { data: me } = useNuxtData<{ signedIn: boolean, signIn?: { email: boolean, providers: { id: string, label: string }[] } }>('core:me')
const providers = computed(() => me.value?.signIn?.providers ?? [])
// Errors come back from a provider's callback; while one provider is offered it can be named.
const providerName = computed(() => providers.value.length === 1 ? providers.value[0]!.label : 'Your provider')
const errorCode = typeof route.query.error === 'string' ? route.query.error : null
const providerErrors = computed<Record<string, string>>(() => ({
  'core.sign-in.provider-unverified': `${providerName.value} has not confirmed this account's email address. Confirm it with ${providerName.value}, or sign in another way.`,
  'core.sign-in.provider-domain': `That ${providerName.value} account is not from an organisation that can sign in here. Choose another account.`,
  'core.sign-in.provider-cancelled': `${providerName.value} sign-in was cancelled.`,
  'core.sign-in.closed': 'This theatre is not taking new accounts at the moment.',
  'core.account.disabled': 'This account is disabled. Contact the theatre to find out why.',
}))
const providerError = computed(() => errorCode ? (providerErrors.value[errorCode] ?? `${providerName.value} did not confirm who you are. Try again.`) : null)
const providerHref = (id: string) => `/api/core/sign-in/${id}${next ? `?next=${encodeURIComponent(next)}` : ''}`

async function withPasskey() {
  busy.value = true
  refusal.value = null
  const answer = await provePasskey<{ next: string }>('/api/core/sign-in/passkey/options', '/api/core/sign-in/passkey', next ? { next } : {})
  busy.value = false
  if (answer.ok) return arriveSignedIn(answer.data)
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
  if (answer.ok) return arriveSignedIn(answer.data)
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
        v-for="provider in providers"
        :key="provider.id"
        block
        color="neutral"
        variant="outline"
        :href="providerHref(provider.id)"
        external
      >
        Sign in with {{ provider.label }}
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
          <UPinInput
            v-model="digits"
            otp
            type="number"
            :length="CODE_LENGTH"
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
