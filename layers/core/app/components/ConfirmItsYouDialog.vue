<!-- The "Confirm it is you" dialogue (ID-28; identity spec part 6: a dialogue, not a page). With a
     passkey, the browser's passkey prompt opens at once and the action carries on when it is used.
     A basic sign-in on an account with no passkey gets a six-digit code by email instead, typed
     here. A strong sign-in is never confirmed by email. An account with an authenticator app may
     type its code instead of using the passkey; after an email sign-in, where the theatre allows, that
     code also makes the sign-in strong. -->
<script setup lang="ts">
import type { Refusal } from '../utils/identity'
import type { ConfirmReason } from '../composables/useConfirmItsYou'

const props = defineProps<{ reason: ConfirmReason }>()
const emit = defineEmits<{ close: [confirmed: boolean] }>()
const { t } = useT()
const settle = (confirmed: boolean) => emit('close', confirmed)

const ways = ref<('passkey' | 'authenticator' | 'code')[] | null>(null)
// Whether the app's code would make this sign-in strong, so it is offered when a strong one is needed.
const authenticatorStrong = ref(false)
const appDigits = ref<number[]>([])
const appCode = computed(() => appDigits.value.join(''))
const useApp = computed(() => !!ways.value?.includes('authenticator') && (!strongNeeded.value || authenticatorStrong.value))
const address = ref<string | null>(null)
const refusal = ref<Refusal | null>(null)
const busy = ref(false)
const codeSent = ref(false)
const CODE_LENGTH = 6 // not-policy: the length of the code the server sends
// One box a digit; the request takes them as one string.
const digits = ref<number[]>([])
const code = computed(() => digits.value.join(''))
const strongNeeded = computed(() => props.reason === 'core.access.needs-strong-sign-in')

async function usePasskey() {
  busy.value = true
  refusal.value = null
  const answer = await provePasskey('/api/core/me/reassert/options', '/api/core/me/reassert')
  busy.value = false
  if (answer.ok) return settle(true)
  refusal.value = answer.refusal
}

async function sendCode() {
  busy.value = true
  refusal.value = null
  const answer = await callIdentity('/api/core/me/reassert/code', {})
  busy.value = false
  if (answer.ok) codeSent.value = true
  else refusal.value = answer.refusal
}

async function checkCode() {
  busy.value = true
  refusal.value = null
  const answer = await callIdentity('/api/core/me/reassert/code/confirm', { code: code.value })
  busy.value = false
  if (answer.ok) return settle(true)
  refusal.value = answer.refusal
}

async function checkApp() {
  busy.value = true
  refusal.value = null
  const answer = await callIdentity('/api/core/me/reassert/authenticator', { code: appCode.value })
  busy.value = false
  if (answer.ok) return settle(true)
  appDigits.value = []
  refusal.value = answer.refusal
}

// As it opens: find how this sign-in may confirm, and start the quickest way at once.
onMounted(async () => {
  const answer = await callIdentity<{ ways: ('passkey' | 'authenticator' | 'code')[], address: string | null, authenticatorStrong: boolean }>('/api/core/me/reassert')
  if (!answer.ok) {
    refusal.value = answer.refusal
    ways.value = []
    return
  }
  ways.value = answer.data.ways
  address.value = answer.data.address
  authenticatorStrong.value = answer.data.authenticatorStrong
  if (ways.value.includes('passkey')) await usePasskey()
  else if (ways.value.includes('code') && !strongNeeded.value && !useApp.value) await sendCode()
})
</script>

<template>
  <UModal
    :title="t('core.confirm-its-you.title')"
    :close="{ onClick: () => settle(false) }"
    :description="strongNeeded ? (useApp ? t('core.confirm-its-you.strong-or-app') : t('core.confirm-its-you.strong')) : t('core.confirm-its-you.description')"
  >
    <template #body>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <USkeleton
          v-if="ways === null"
          class="h-10 w-full"
        />
        <template v-else-if="ways.includes('passkey') || useApp">
          <UButton
            v-if="ways.includes('passkey')"
            block
            icon="i-lucide-key-round"
            :loading="busy"
            :label="t('core.confirm-its-you.passkey')"
            @click="usePasskey"
          />
          <template v-if="useApp">
            <USeparator
              v-if="ways.includes('passkey')"
              :label="t('core.confirm-its-you.or')"
            />
            <form
              class="space-y-3"
              @submit.prevent="checkApp"
            >
              <UFormField :label="t('core.confirm-its-you.app-code')">
                <UPinInput
                  v-model="appDigits"
                  otp
                  type="number"
                  :length="CODE_LENGTH"
                />
              </UFormField>
              <UButton
                type="submit"
                block
                color="neutral"
                variant="outline"
                :loading="busy"
                :label="t('core.confirm-its-you.confirm')"
              />
            </form>
          </template>
        </template>
        <template v-else-if="ways.includes('code') && !strongNeeded">
          <form
            v-if="codeSent"
            class="space-y-3"
            @submit.prevent="checkCode"
          >
            <UFormField
              :label="t('core.confirm-its-you.code')"
              :help="t('core.confirm-its-you.code-sent', { address: address ?? '' })"
            >
              <UPinInput
                v-model="digits"
                otp
                type="number"
                :length="CODE_LENGTH"
                autofocus
              />
            </UFormField>
            <UButton
              type="submit"
              block
              :loading="busy"
              :label="t('core.confirm-its-you.confirm')"
            />
            <UButton
              block
              color="neutral"
              variant="link"
              :disabled="busy"
              :label="t('core.confirm-its-you.resend')"
              @click="sendCode"
            />
          </form>
          <UButton
            v-else
            block
            icon="i-lucide-mail"
            :loading="busy"
            :label="t('core.confirm-its-you.send-code')"
            @click="sendCode"
          />
        </template>
        <template v-else>
          <p>{{ strongNeeded ? t('core.confirm-its-you.add-passkey') : t('core.confirm-its-you.no-way') }}</p>
          <UButton
            block
            :to="strongNeeded ? '/account/passkey' : '/sign-in'"
            :label="strongNeeded ? t('core.confirm-its-you.add-passkey-button') : t('core.confirm-its-you.sign-in')"
            @click="settle(false)"
          />
        </template>
      </div>
    </template>
  </UModal>
</template>
