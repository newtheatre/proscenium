<script setup lang="ts">
import { renderSVG } from 'uqr'
import { saysDayLong } from '#shared/utils/when'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/getting-started/your-account' })

interface FactorState {
  confirmed: boolean
  confirmedAt: number | null
  recoveryCodesRemaining: number
  required: boolean
}

type Step = 'loading' | 'none' | 'enrolling' | 'codes' | 'active'

const CODE_LENGTH = 6

const step = ref<Step>('loading')
const state = ref<FactorState | null>(null)
const secret = ref('')
const qr = ref('')
const digits = ref<string[]>([])
const codes = ref<string[]>([])
const notice = ref<string | null>(null)
const working = ref(false)

async function load(): Promise<void> {
  state.value = await $fetch<FactorState>('/api/account/mfa')
  step.value = state.value.confirmed ? 'active' : 'none'
}

const reauthenticating = ref(false)
const pending = ref<(() => Promise<void>) | null>(null)

const confirmingRemoval = ref(false)
const removeFailure = ref<string | null>(null)

function sayOnPage(said: string): void {
  notice.value = said
}

async function attempt(action: () => Promise<void>, refused = sayOnPage): Promise<void> {
  if (working.value) return
  working.value = true
  notice.value = null
  try {
    await action()
  }
  catch (error) {
    if (needsReauthentication(error)) {
      // The confirmation gives way to the modal; what waits on it is the confirmed action itself.
      confirmingRemoval.value = false
      pending.value = action
      reauthenticating.value = true
    }
    else {
      refused(refusalText(error))
    }
  }
  finally {
    working.value = false
  }
}

// The action that asked for reassertion is retried once, exactly as it was; the modal never
// runs it itself (A-128 criterion 3).
function retryAfterReauthentication(): void {
  const action = pending.value
  pending.value = null
  if (action) void attempt(action)
}

useReauthenticateReturn()

const begin = (): Promise<void> => attempt(async () => {
  const started = await $fetch<{ secret: string, uri: string }>('/api/account/mfa/enrol', { method: 'POST' })
  secret.value = started.secret
  qr.value = `data:image/svg+xml;base64,${btoa(renderSVG(started.uri))}`
  digits.value = []
  step.value = 'enrolling'
})

// A way out before the codes are shown (A-112 criterion 6). An enrolment nobody confirmed already
// reads as none on the next load, so leaving here leaves nothing half done behind.
function abandon(): void {
  digits.value = []
  secret.value = ''
  qr.value = ''
  step.value = 'none'
}

const confirm = (entered: string[]): Promise<void> => attempt(async () => {
  try {
    const done = await $fetch<{ recoveryCodes: string[] }>('/api/account/mfa/confirm', {
      method: 'POST',
      body: { code: entered.join('') },
    })
    codes.value = done.recoveryCodes
    step.value = 'codes'
  }
  catch (error) {
    digits.value = []
    throw error
  }
})

const regenerate = (): Promise<void> => attempt(async () => {
  const fresh = await $fetch<{ recoveryCodes: string[] }>('/api/account/mfa/recovery-codes', { method: 'POST' })
  codes.value = fresh.recoveryCodes
  step.value = 'codes'
})

// Asked first (A-109 criterion 6), then re-authenticated if the session is stale, never both
// twice: a retry runs removeFactor directly (A-128 criterion 9).
function askToRemove(): void {
  removeFailure.value = null
  confirmingRemoval.value = true
}

async function removeFactor(): Promise<void> {
  await $fetch('/api/account/mfa', { method: 'DELETE' })
  confirmingRemoval.value = false
  await load()
}

function sayInTheDialogue(said: string): void {
  removeFailure.value = said
}

const remove = (): Promise<void> => attempt(removeFactor, sayInTheDialogue)

// Shown exactly once, so leaving this screen is the point at which they are gone.
const finish = (): Promise<void> => attempt(async () => {
  codes.value = []
  await load()
})

const closing = ref(false)
const confirmation = reactive({ email: '' })
const { account, refresh: refreshAccount } = useAccount()

// Erasure is final and the session goes with it, so the screen leaves rather than re-reading.
const closeAccount = (): Promise<void> => attempt(async () => {
  await $fetch('/api/account/close', { method: 'POST', body: { ...confirmation } })
  await refreshAccount()
  await navigateTo('/')
})

const confirmedOn = computed(() =>
  state.value?.confirmedAt ? saysDayLong(state.value.confirmedAt, { year: true }) : null)

onMounted(load)

useSeoMeta({ title: 'Security' })
</script>

<template>
  <AccountSettings
    data-test="account-security-page"
    title="Sign-in and security"
    description="An authenticator app is a second step at sign-in, so a stolen password is not enough on its own."
  >
    <SignInMethods />

    <UPageCard class="mt-6">
      <UAlert
        v-if="notice"
        class="mb-6"
        color="error"
        variant="subtle"
        :description="notice"
      />

      <div
        v-if="step === 'loading'"
        class="flex items-center gap-3 text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin"
        />
        <span>Reading your security settings.</span>
      </div>

      <div
        v-else-if="step === 'none'"
        class="space-y-4"
      >
        <p class="text-muted">
          You have no authenticator app on this account.
        </p>
        <UButton
          data-test="begin"
          :loading="working"
          @click="begin"
        >
          Set up an authenticator app
        </UButton>
      </div>

      <div
        v-else-if="step === 'enrolling'"
        class="space-y-6"
      >
        <div class="space-y-2">
          <h2 class="text-lg font-semibold">
            Scan this with your authenticator app
          </h2>
          <p class="text-sm text-muted">
            Or type the code below in by hand if you cannot scan it.
          </p>
        </div>

        <img
          data-test="mfa-qr"
          class="w-48 bg-white p-3"
          :src="qr"
          alt="Enrolment code for an authenticator app"
        >

        <p
          data-test="mfa-secret"
          class="font-mono text-sm break-all text-muted"
        >
          {{ secret }}
        </p>

        <UForm
          :state="{ digits }"
          data-test="mfa-confirm"
          class="space-y-2"
        >
          <UFormField label="Enter the six digits it shows to finish.">
            <UPinInput
              v-model="digits"
              :length="CODE_LENGTH"
              :disabled="working"
              otp
              size="lg"
              @complete="confirm"
            />
          </UFormField>
        </UForm>

        <UButton
          color="neutral"
          variant="ghost"
          data-test="mfa-cancel"
          :disabled="working"
          @click="abandon"
        >
          Stop setting this up
        </UButton>
      </div>

      <div
        v-else-if="step === 'codes'"
        class="space-y-4"
      >
        <div class="space-y-2">
          <h2 class="text-lg font-semibold">
            Save your recovery codes
          </h2>
          <p class="text-sm text-muted">
            These are shown once and never again. Each one works a single time, for the day you do
            not have your phone.
          </p>
        </div>

        <ul
          data-test="recovery-codes"
          class="grid grid-cols-2 gap-2 font-mono text-sm"
        >
          <li
            v-for="code in codes"
            :key="code"
            class="rounded bg-elevated px-3 py-2"
          >
            {{ code }}
          </li>
        </ul>

        <UButton
          data-test="codes-saved"
          :loading="working"
          @click="finish"
        >
          I have saved them
        </UButton>
      </div>

      <div
        v-else
        data-test="mfa-active"
        class="space-y-4"
      >
        <div class="space-y-1">
          <p>
            An authenticator app is protecting this account<span v-if="confirmedOn">, since {{ confirmedOn }}</span>.
          </p>
          <p class="text-sm text-muted">
            {{ state?.recoveryCodesRemaining }} recovery codes remaining.
          </p>
        </div>

        <UAlert
          v-if="state?.required"
          data-test="mfa-required"
          color="info"
          variant="subtle"
          description="A role you hold needs an authenticator app. Give the role up first if you want to remove this."
        />

        <div class="flex flex-wrap gap-2">
          <UButton
            data-test="regenerate"
            variant="subtle"
            :loading="working"
            @click="regenerate"
          >
            Show a new set of recovery codes
          </UButton>
          <UButton
            data-test="remove"
            color="error"
            variant="subtle"
            :loading="working"
            @click="askToRemove"
          >
            Remove the authenticator
          </UButton>
        </div>
      </div>
    </UPageCard>

    <UPageCard
      class="mt-6"
      title="Your data"
      description="Everything we hold about you, in one file."
    >
      <div class="flex flex-wrap gap-2">
        <UButton
          data-test="export"
          to="/api/account/export"
          external
          download
          variant="subtle"
          icon="i-lucide-download"
        >
          Download my data
        </UButton>
        <UButton
          data-test="close-account"
          color="error"
          variant="subtle"
          icon="i-lucide-user-x"
          @click="closing = true"
        >
          Close my account
        </UButton>
      </div>
    </UPageCard>

    <UModal
      v-model:open="closing"
      title="Close your account"
      description="Your name and address are removed and the account cannot be used again. Download your data first if you want it."
    >
      <template #body>
        <UForm
          :state="confirmation"
          class="space-y-4"
          @submit="closeAccount"
        >
          <UAlert
            color="warning"
            variant="subtle"
            description="This cannot be undone. Your bookings and attendance stay on our own count of the year, with your name taken off them."
          />
          <UFormField
            label="Type your email address to confirm"
            :description="account.user?.email"
          >
            <UInput
              v-model="confirmation.email"
              data-test="close-email"
              type="email"
              required
            />
          </UFormField>
          <UButton
            type="submit"
            color="error"
            data-test="close-submit"
            :loading="working"
          >
            Close my account
          </UButton>
        </UForm>
      </template>
    </UModal>

    <ConfirmModal
      v-model:open="confirmingRemoval"
      name="remove-authenticator"
      title="Remove the authenticator"
      verb="Remove the authenticator"
      consequence="Signing in goes back to your password alone, and your recovery codes stop working. You can set one up again at any time."
      :loading="working"
      :failure="removeFailure"
      @confirm="remove"
    />

    <ReauthenticateModal
      v-model:open="reauthenticating"
      @reauthenticated="retryAfterReauthentication"
    />
  </AccountSettings>
</template>
