<!-- Sign in (ID-01, ID-02, ID-04, ID-07): an emailed link and code first, as most people use it,
     then a passkey, or an outside provider the theatre has switched on (Google so far), one button
     each. -->
<script setup lang="ts">
import { z } from 'zod'
import type { Refusal } from '../../utils/identity'

// Someone already signed in is sent on before the page is made. The page reads the same answer.
definePageMeta({
  middleware: async (to) => {
    const { data } = await useAPI<{ signedIn: boolean }>('/api/core/me', { key: 'core:me' })
    if (data.value?.signedIn) return navigateTo(nextPath(to.query.next) ?? '/')
  },
})
const { t } = useT()
useSeoMeta({ title: () => t('core.sign-in.page.title') })
const route = useRoute()
const next = nextPath(route.query.next)
const refusal = ref<Refusal | null>(null)
// Which request is under way, so its own button shows it.
const pending = ref<'passkey' | 'link' | 'code' | null>(null)
const address = ref('')
const CODE_LENGTH = 6 // not-policy: the length of the code the server sends
// One box a digit; the request takes them as one string.
const digits = ref<number[]>([])
const code = computed(() => digits.value.join(''))
const sent = ref(false)
// What the two routes check, shown beside the field rather than in a browser bubble.
const addressSchema = z.object({ address: z.email().max(254) }) // not-policy: the longest address
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, t('core.form.invalid.code', { count: CODE_LENGTH })) }) // not-policy: codes are six digits
const addressForm = useTemplateRef('addressForm')
const codeForm = useTemplateRef('codeForm')
const turnstile = useTemplateRef('turnstile')
const { data: me } = useNuxtData<{ signedIn: boolean, signIn?: { email: boolean, providers: { id: string, label: string }[], openSignUp?: boolean } }>('core:me')
const providers = computed(() => me.value?.signIn?.providers ?? [])
// Errors come back from a provider's callback; while one provider is offered it can be named.
const providerName = computed(() => providers.value.length === 1 ? providers.value[0]!.label : t('core.sign-in.page.your-provider'))
const errorCode = typeof route.query.error === 'string' ? route.query.error : null
const providerErrors: Record<string, string> = {
  'core.sign-in.provider-unverified': 'core.sign-in.page.error.provider-unverified',
  'core.sign-in.provider-domain': 'core.sign-in.page.error.provider-domain',
  'core.sign-in.provider-cancelled': 'core.sign-in.page.error.provider-cancelled',
  'core.sign-in.closed': 'core.sign-in.page.error.closed',
  'core.account.disabled': 'core.sign-in.page.error.disabled',
}
const providerError = computed(() => errorCode ? t(providerErrors[errorCode] ?? 'core.sign-in.page.error.provider-other', { provider: providerName.value }) : null)
const providerHref = (id: string) => `/api/core/sign-in/${id}${next ? `?next=${encodeURIComponent(next)}` : ''}`

async function withPasskey() {
  pending.value = 'passkey'
  refusal.value = null
  const answer = await provePasskey<{ next: string }>('/api/core/sign-in/passkey/options', '/api/core/sign-in/passkey', next ? { next } : {})
  pending.value = null
  if (answer.ok) return arriveSignedIn(answer.data)
  refusal.value = answer.refusal
}

// Offer the site's passkeys among the address box's suggestions (its autocomplete says webauthn).
// Waits in the background; a pick signs in. Pressing the passkey button cancels it and starts afresh.
onMounted(async () => {
  const answer = await provePasskey<{ next: string }>('/api/core/sign-in/passkey/options', '/api/core/sign-in/passkey', next ? { next } : {}, true)
  if (answer.ok) return arriveSignedIn(answer.data)
  if (answer.refusal.code !== 'core.passkey.cancelled') refusal.value = answer.refusal
})

async function sendLink() {
  pending.value = 'link'
  refusal.value = null
  // Pressed before the bot check has finished, the button waits for it rather than being refused.
  const challenge = await turnstile.value?.waitForToken() ?? ''
  const answer = await callIdentity<{ sent?: true, provider?: string, to?: string }>('/api/core/sign-in/email', { address: address.value, ...(next ? { next } : {}) }, { 'cf-turnstile-response': challenge })
  pending.value = null
  if (!answer.ok) {
    refusal.value = answer.refusal
    addressForm.value?.setErrors(fieldErrors(answer.refusal))
    return
  }
  if (answer.data.to) return navigateTo(answer.data.to, { external: true })
  sent.value = true
}

async function useCode() {
  pending.value = 'code'
  refusal.value = null
  const answer = await callIdentity<{ next: string, offerPasskey: boolean, welcome: boolean }>('/api/core/sign-in/code', { address: address.value, code: code.value })
  pending.value = null
  if (answer.ok) return arriveSignedIn(answer.data)
  refusal.value = answer.refusal
  codeForm.value?.setErrors(fieldErrors(answer.refusal))
}
</script>

<template>
  <IdentityCard
    :title="sent ? t('core.sign-in.page.sent-title') : t('core.sign-in.page.title')"
    :description="!sent && me?.signIn?.email && me?.signIn?.openSignUp ? t('core.sign-in.page.open-sign-up') : undefined"
  >
    <UAlert
      v-if="providerError"
      role="alert"
      color="error"
      :title="providerError"
    />
    <RefusalNotice :refusal="refusal" />

    <template v-if="!sent">
      <template v-if="me?.signIn?.email">
        <UForm
          ref="addressForm"
          :schema="addressSchema"
          :state="{ address }"
          class="flex flex-col gap-4"
          novalidate
          @submit="sendLink"
        >
          <UFormField
            :label="t('core.sign-in.page.address')"
            name="address"
          >
            <UInput
              v-model="address"
              type="email"
              autocomplete="email webauthn"
            />
          </UFormField>
          <TurnstileCheck
            ref="turnstile"
            quiet
          />
          <UButton
            type="submit"
            block
            size="lg"
            :loading="pending === 'link'"
          >
            {{ t('core.sign-in.page.send-link') }}
          </UButton>
        </UForm>
        <USeparator :label="t('core.sign-in.page.or')" />
      </template>
      <UButton
        block
        :size="me?.signIn?.email ? undefined : 'lg'"
        :color="me?.signIn?.email ? 'neutral' : undefined"
        :variant="me?.signIn?.email ? 'outline' : undefined"
        icon="i-lucide-key-round"
        :loading="pending === 'passkey'"
        @click="withPasskey"
      >
        {{ t('core.sign-in.page.passkey') }}
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
        {{ t('core.sign-in.page.provider', { provider: provider.label }) }}
      </UButton>
    </template>

    <template v-else>
      <p class="text-sm text-muted">
        {{ t('core.sign-in.page.sent', { address }) }}
      </p>
      <UForm
        ref="codeForm"
        :schema="codeSchema"
        :state="{ code }"
        class="flex flex-col gap-4"
        novalidate
        @submit="useCode"
      >
        <UFormField
          :label="t('core.sign-in.page.code')"
          name="code"
        >
          <UPinInput
            v-model="digits"
            otp
            type="number"
            :length="CODE_LENGTH"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="pending === 'code'"
        >
          {{ t('core.sign-in.page.use-code') }}
        </UButton>
      </UForm>
      <UButton
        variant="link"
        color="neutral"
        @click="sent = false"
      >
        {{ t('core.sign-in.page.different-address') }}
      </UButton>
    </template>
  </IdentityCard>
</template>
