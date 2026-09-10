<script setup lang="ts">
import type { ReauthOption } from '#shared/utils/reauthentication'

// Session-scoped and account-current (A-128 criteria 1 to 4): what this modal offers is read
// fresh each time it opens, never assumed from how the session began.

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ reauthenticated: [] }>()

const CODE_LENGTH = 6

const options = ref<ReauthOption[]>([])
const loading = ref(false)
const working = ref(false)
const notice = ref<string | null>(null)

const password = ref('')
const digits = ref<string[]>([])
const recoveryCode = ref('')
const usingRecoveryCode = ref(false)

const passwordOption = computed(() => options.value.find(option => option.kind === 'password'))
const hasPasskey = computed(() => options.value.some(option => option.kind === 'passkey'))
const hasGoogle = computed(() => options.value.some(option => option.kind === 'google'))
const nothingOffered = computed(() => !loading.value && options.value.length === 0)

async function load(): Promise<void> {
  loading.value = true
  notice.value = null
  password.value = ''
  digits.value = []
  recoveryCode.value = ''
  usingRecoveryCode.value = false
  try {
    const answer = await $fetch<{ options: ReauthOption[] }>('/api/account/reauthenticate')
    options.value = answer.options
  }
  catch (error) {
    notice.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

watch(open, (value) => {
  if (value) void load()
})

function succeed(): void {
  open.value = false
  emit('reauthenticated')
}

async function submitPassword(): Promise<void> {
  if (working.value) return
  working.value = true
  notice.value = null
  try {
    await $fetch('/api/account/reauthenticate/password', {
      method: 'POST',
      body: {
        password: password.value,
        code: passwordOption.value?.secondFactor
          ? (usingRecoveryCode.value ? recoveryCode.value : digits.value.join(''))
          : undefined,
      },
    })
    succeed()
  }
  catch (error) {
    notice.value = refusalText(error)
    digits.value = []
    recoveryCode.value = ''
  }
  finally {
    working.value = false
  }
}

const { authenticate } = useWebAuthn({ authenticateEndpoint: '/api/account/reauthenticate/passkey' })
const passkeyWorking = ref(false)

async function usePasskey(): Promise<void> {
  passkeyWorking.value = true
  notice.value = null
  try {
    await authenticate()
    succeed()
  }
  catch (error) {
    notice.value = refusalText(error)
  }
  finally {
    passkeyWorking.value = false
  }
}

// A full round trip, so this leaves the page rather than resolving in place; the return trip is
// picked up by useReauthenticateReturn on the page that asked (A-128 criterion 4).
function useGoogle(): void {
  const next = useRoute().fullPath
  window.location.href = `/auth/google?reauth=1&next=${encodeURIComponent(next)}`
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Confirm it's you"
    description="This action is sensitive, so it asks again before it goes ahead."
  >
    <template #body>
      <div
        data-test="reauthenticate-modal"
        class="space-y-4"
      >
        <UAlert
          v-if="notice"
          color="error"
          variant="subtle"
          :description="notice"
        />

        <div
          v-if="loading"
          class="flex items-center gap-3 text-muted"
        >
          <UIcon
            name="i-lucide-loader-circle"
            class="animate-spin"
          />
          <span>Reading how you can confirm this.</span>
        </div>

        <UAlert
          v-else-if="nothingOffered"
          color="warning"
          variant="subtle"
          description="There is no way to confirm this here. Sign out and sign in again."
        />

        <template v-else>
          <div
            v-if="hasPasskey"
            class="space-y-2"
          >
            <UButton
              data-test="reauth-passkey"
              icon="i-lucide-fingerprint"
              :loading="passkeyWorking"
              @click="usePasskey"
            >
              Use your passkey
            </UButton>
          </div>

          <div
            v-if="hasGoogle"
            class="space-y-2"
          >
            <UButton
              data-test="reauth-google"
              color="neutral"
              variant="subtle"
              icon="i-lucide-mail"
              @click="useGoogle"
            >
              Continue with Google
            </UButton>
          </div>

          <form
            v-if="passwordOption"
            class="space-y-3"
            @submit.prevent="submitPassword"
          >
            <UFormField label="Password">
              <UInput
                v-model="password"
                data-test="reauth-password"
                type="password"
                autocomplete="current-password"
                required
              />
            </UFormField>

            <div
              v-if="passwordOption.secondFactor"
              data-test="reauth-code"
              class="space-y-2"
            >
              <p class="text-sm text-muted">
                And the code from your authenticator app.
              </p>
              <UPinInput
                v-if="!usingRecoveryCode"
                v-model="digits"
                :length="CODE_LENGTH"
                :disabled="working"
                otp
              />
              <UInput
                v-else
                v-model="recoveryCode"
                data-test="reauth-recovery-code"
                placeholder="XXXX-XXXX-XXXX"
                autocomplete="one-time-code"
              />
              <UButton
                variant="link"
                class="px-0"
                @click="usingRecoveryCode = !usingRecoveryCode"
              >
                {{ usingRecoveryCode ? 'Use my authenticator instead' : 'I do not have my authenticator' }}
              </UButton>
            </div>

            <UButton
              type="submit"
              data-test="reauth-submit"
              :loading="working"
            >
              Confirm
            </UButton>
          </form>
        </template>
      </div>
    </template>
  </UModal>
</template>
