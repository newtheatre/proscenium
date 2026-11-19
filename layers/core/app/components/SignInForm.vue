<!-- The ways in (ID-01, ID-02, ID-04, ID-07). The address comes first (Matt, 19 November), then
     only the ways in that fit it: an address in a managed domain goes straight to its provider; one
     an outside provider accepts is offered that provider beside an emailed code; any other is sent
     its code at once. A passkey needs no address, so it is offered beneath, and the address box
     suggests saved passkeys as well. The sign-in page draws it in its card; a page that asks for a sign-in in place (a scheme's
     join page) draws it there, with `next` set to come back. `sent` is true once a link and code have
     been sent, for the page's title. -->
<script setup lang="ts">
import { z } from 'zod'
import type { Refusal } from '../utils/identity'

const props = defineProps<{
  /** Where to go once signed in. */
  next?: string
}>()
const sent = defineModel<boolean>('sent', { default: false })
const { t } = useT()

const route = useRoute()
const refusal = ref<Refusal | null>(null)
// Which request is under way, so its own button shows it.
const pending = ref<'passkey' | 'link' | 'code' | null>(null)
const address = ref('')
const CODE_LENGTH = 6 // not-policy: the length of the code the server sends
// One box a digit; the request takes them as one string.
const digits = ref<number[]>([])
const code = computed(() => digits.value.join(''))
// What the two routes check, shown beside the field rather than in a browser bubble.
const addressSchema = z.object({ address: z.email().max(254) }) // not-policy: the longest address
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, t('core.form.invalid.code', { count: CODE_LENGTH })) }) // not-policy: codes are six digits
const addressForm = useTemplateRef('addressForm')
const codeForm = useTemplateRef('codeForm')
const turnstile = useTemplateRef('turnstile')
interface Methods { email: boolean, providers: { id: string, label: string, domains: string[] }[], managed: { domains: string[], provider: string } | null, openSignUp?: boolean }
const { data: me } = await useAPI<{ signedIn: boolean, signIn?: Methods }>('/api/core/me', { key: 'core:me' })
const providers = computed(() => me.value?.signIn?.providers ?? [])
const email = computed(() => !!me.value?.signIn?.email)
// With no emailed code and no provider, an address leads nowhere: only the passkey is offered.
const asksAddress = computed(() => email.value || providers.value.length > 0)
// Once an address is given and more than one way in fits it, the choice; `null` while it is being typed.
const choosing = ref<{ address: string, providers: Methods['providers'] } | null>(null)
const nowhere = ref(false)
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
const providerHref = (id: string, loginHint?: string) => {
  const query = new URLSearchParams({ ...(props.next ? { next: props.next } : {}), ...(loginHint ? { login_hint: loginHint } : {}) }).toString()
  return `/api/core/sign-in/${id}${query ? `?${query}` : ''}`
}

/** The address decides the ways in: its domain's provider if managed, else those that accept it, else the code. */
async function carryOn() {
  refusal.value = null
  nowhere.value = false
  const given = address.value.trim().toLowerCase()
  const domain = given.split('@').pop() ?? ''
  const managed = me.value?.signIn?.managed
  if (managed?.domains.includes(domain)) return navigateTo(providerHref(managed.provider, given), { external: true })
  const fitting = providers.value.filter(p => !p.domains.length || p.domains.includes(domain))
  if (fitting.length) {
    choosing.value = { address: given, providers: fitting }
    return
  }
  if (email.value) return sendLink()
  nowhere.value = true
}
function changeAddress() {
  choosing.value = null
  nowhere.value = false
}
// A provider that names this address's organisation is the likely way in, so it leads; otherwise the code does.
const providerLeads = computed(() => !email.value || !!choosing.value?.providers.some(p => p.domains.length))

async function withPasskey() {
  pending.value = 'passkey'
  refusal.value = null
  const answer = await provePasskey<{ next: string }>('/api/core/sign-in/passkey/options', '/api/core/sign-in/passkey', props.next ? { next: props.next } : {})
  pending.value = null
  if (answer.ok) return arriveSignedIn(answer.data)
  refusal.value = answer.refusal
}

// Offer the site's passkeys among the address box's suggestions (its autocomplete says webauthn).
// Waits in the background; a pick signs in. Pressing the passkey button cancels it and starts afresh.
onMounted(async () => {
  const answer = await provePasskey<{ next: string }>('/api/core/sign-in/passkey/options', '/api/core/sign-in/passkey', props.next ? { next: props.next } : {}, true)
  if (answer.ok) return arriveSignedIn(answer.data)
  if (answer.refusal.code !== 'core.passkey.cancelled') refusal.value = answer.refusal
})

async function sendLink() {
  pending.value = 'link'
  refusal.value = null
  // Pressed before the bot check has finished, the button waits for it rather than being refused.
  const challenge = await turnstile.value?.waitForToken() ?? ''
  const answer = await callIdentity<{ sent?: true, provider?: string, to?: string }>('/api/core/sign-in/email', { address: address.value, ...(props.next ? { next: props.next } : {}) }, { 'cf-turnstile-response': challenge })
  pending.value = null
  if (!answer.ok) {
    refusal.value = answer.refusal
    addressForm.value?.setErrors(fieldErrors(answer.refusal))
    return
  }
  if (answer.data.to) return navigateTo(answer.data.to, { external: true })
  choosing.value = null
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
  <div class="flex flex-col gap-4">
    <UAlert
      v-if="providerError"
      role="alert"
      color="error"
      :title="providerError"
    />
    <RefusalNotice :refusal="refusal" />

    <template v-if="!sent">
      <template v-if="asksAddress">
        <UForm
          v-if="!choosing"
          ref="addressForm"
          :schema="addressSchema"
          :state="{ address }"
          class="flex flex-col gap-4"
          novalidate
          @submit="carryOn"
        >
          <UFormField
            :label="t('core.sign-in.page.address')"
            name="address"
          >
            <UInput
              v-model="address"
              type="email"
              autocomplete="email webauthn"
              @update:model-value="nowhere = false"
            />
          </UFormField>
          <UAlert
            v-if="nowhere"
            color="warning"
            variant="subtle"
            icon="i-lucide-info"
            :title="t('core.sign-in.page.no-way-in')"
          />
          <UButton
            type="submit"
            block
            size="lg"
            :loading="pending === 'link'"
          >
            {{ t('core.sign-in.page.continue') }}
          </UButton>
        </UForm>
        <div
          v-else
          class="flex flex-col gap-3"
        >
          <p class="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>{{ t('core.sign-in.page.signing-in-as', { address: choosing.address }) }}</span>
            <UButton
              variant="link"
              color="neutral"
              size="sm"
              class="p-0"
              :label="t('core.sign-in.page.change-address')"
              @click="changeAddress"
            />
          </p>
          <UButton
            v-for="(provider, i) in choosing.providers"
            :key="provider.id"
            block
            size="lg"
            :color="providerLeads && i === 0 ? undefined : 'neutral'"
            :variant="providerLeads && i === 0 ? undefined : 'outline'"
            :href="providerHref(provider.id, choosing.address)"
            external
          >
            {{ t('core.sign-in.page.provider', { provider: provider.label }) }}
          </UButton>
          <UButton
            v-if="email"
            block
            size="lg"
            :color="providerLeads ? 'neutral' : undefined"
            :variant="providerLeads ? 'outline' : undefined"
            icon="i-lucide-mail"
            :loading="pending === 'link'"
            @click="sendLink"
          >
            {{ t('core.sign-in.page.send-link') }}
          </UButton>
        </div>
        <!-- The bot check stays on the page through both steps, so a code can be sent from either. -->
        <TurnstileCheck
          v-if="email"
          ref="turnstile"
          quiet
        />
        <USeparator :label="t('core.sign-in.page.or')" />
      </template>
      <UButton
        block
        :size="asksAddress ? undefined : 'lg'"
        :color="asksAddress ? 'neutral' : undefined"
        :variant="asksAddress ? 'outline' : undefined"
        icon="i-lucide-key-round"
        :loading="pending === 'passkey'"
        @click="withPasskey"
      >
        {{ t('core.sign-in.page.passkey') }}
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
  </div>
</template>
