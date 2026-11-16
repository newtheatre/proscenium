<!-- The "Confirm it is you" dialogue (ID-28; identity spec part 6: a dialogue, not a page). With a
     passkey, the browser's passkey prompt opens at once and the action carries on when it is used.
     A basic sign-in on an account with no passkey gets a six-digit code by email instead, typed
     here. A strong sign-in is never confirmed by email. -->
<script setup lang="ts">
import type { Refusal } from '../utils/identity'
import type { ConfirmReason } from '../composables/useConfirmItsYou'

const props = defineProps<{ reason: ConfirmReason }>()
const emit = defineEmits<{ close: [confirmed: boolean] }>()
const { t } = useT()
const settle = (confirmed: boolean) => emit('close', confirmed)

const ways = ref<('passkey' | 'code')[] | null>(null)
const address = ref<string | null>(null)
const refusal = ref<Refusal | null>(null)
const busy = ref(false)
const codeSent = ref(false)
const code = ref('')
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

// As it opens: find how this sign-in may confirm, and start the quickest way at once.
onMounted(async () => {
  const answer = await callIdentity<{ ways: ('passkey' | 'code')[], address: string | null }>('/api/core/me/reassert')
  if (!answer.ok) {
    refusal.value = answer.refusal
    ways.value = []
    return
  }
  ways.value = answer.data.ways
  address.value = answer.data.address
  if (ways.value.includes('passkey')) await usePasskey()
  else if (ways.value.includes('code') && !strongNeeded.value) await sendCode()
})
</script>

<template>
  <UModal
    :title="t('core.confirm-its-you.title')"
    :close="{ onClick: () => settle(false) }"
    :description="strongNeeded ? t('core.confirm-its-you.strong') : t('core.confirm-its-you.description')"
  >
    <template #body>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <USkeleton
          v-if="ways === null"
          class="h-10 w-full"
        />
        <template v-else-if="ways.includes('passkey')">
          <UButton
            block
            icon="i-lucide-key-round"
            :loading="busy"
            :label="t('core.confirm-its-you.passkey')"
            @click="usePasskey"
          />
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
              <UInput
                v-model="code"
                inputmode="numeric"
                autocomplete="one-time-code"
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
