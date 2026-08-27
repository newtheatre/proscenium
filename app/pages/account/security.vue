<script setup lang="ts">
import { renderSVG } from 'uqr'
import { formatLondon } from '#shared/utils/london'

definePageMeta({ middleware: 'signed-in' })

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

async function attempt(action: () => Promise<void>): Promise<void> {
  if (working.value) return
  working.value = true
  notice.value = null
  try {
    await action()
  }
  catch (error) {
    notice.value = refusalText(error)
  }
  finally {
    working.value = false
  }
}

const begin = (): Promise<void> => attempt(async () => {
  const started = await $fetch<{ secret: string, uri: string }>('/api/account/mfa/enrol', { method: 'POST' })
  secret.value = started.secret
  qr.value = `data:image/svg+xml;base64,${btoa(renderSVG(started.uri))}`
  digits.value = []
  step.value = 'enrolling'
})

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

const remove = (): Promise<void> => attempt(async () => {
  await $fetch('/api/account/mfa', { method: 'DELETE' })
  await load()
})

// Shown exactly once, so leaving this screen is the point at which they are gone.
const finish = (): Promise<void> => attempt(async () => {
  codes.value = []
  await load()
})

const confirmedOn = computed(() =>
  state.value?.confirmedAt ? formatLondon(new Date(state.value.confirmedAt * 1000), { dateStyle: 'long' }) : null)

onMounted(load)

useSeoMeta({ title: 'Security' })
</script>

<template>
  <UContainer class="max-w-xl py-16">
    <UPageHeader
      title="Security"
      description="An authenticator app is a second step at sign-in, so a stolen password is not enough on its own."
    />

    <UPageCard class="mt-8">
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
          <h2 class="nnt-headline text-xl">
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

        <div
          data-test="mfa-confirm"
          class="space-y-2"
        >
          <p class="text-sm">
            Enter the six digits it shows to finish.
          </p>
          <UPinInput
            v-model="digits"
            :length="CODE_LENGTH"
            :disabled="working"
            otp
            size="lg"
            @complete="confirm"
          />
        </div>
      </div>

      <div
        v-else-if="step === 'codes'"
        class="space-y-4"
      >
        <div class="space-y-2">
          <h2 class="nnt-headline text-xl">
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
          description="A role you hold requires a second factor, so this one cannot be removed while you hold it."
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
            @click="remove"
          >
            Remove the authenticator
          </UButton>
        </div>
      </div>
    </UPageCard>

    <UPageCard
      class="mt-6"
      title="Your data"
      description="Everything the theatre holds about you, in one file. A fuller account page arrives with A-114."
    >
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
    </UPageCard>
  </UContainer>
</template>
