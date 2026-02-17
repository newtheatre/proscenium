<template>
  <UContainer class="flex flex-col items-center justify-center gap-4 p-4 min-h-[calc(100vh-var(--ui-header-height))]">
    <UPageCard
      class="w-full max-w-md"
      highlight
      highlight-color="secondary"
    >
      <div
        v-if="status === 'loading'"
        class="flex flex-col items-center gap-6 p-6 text-center"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-12 animate-spin text-primary"
        />

        <div class="space-y-2">
          <h1 class="text-2xl font-bold">
            Verifying your email
          </h1>
          <p class="text-muted">
            Please wait while we confirm your address.
          </p>
        </div>
      </div>

      <div
        v-else-if="status === 'success'"
        class="flex flex-col items-center gap-6 p-6 text-center"
      >
        <UIcon
          name="i-lucide-circle-check"
          class="size-16 text-success"
        />

        <div class="space-y-2">
          <h1 class="text-2xl font-bold">
            Email verified
          </h1>
          <p class="text-muted">
            {{ statusMessage || 'Your email has been verified successfully.' }}
          </p>
        </div>

        <UButton
          v-if="loggedIn"
          label="Go to account"
          to="/account"
          block
        />
        <UButton
          v-else
          label="Go to login"
          to="/login"
          block
        />
      </div>

      <template v-else>
        <UAlert
          v-if="status === 'error'"
          color="error"
          icon="i-lucide-alert-circle"
          :title="statusMessage"
        />

        <UAuthForm
          :schema="requestSchema"
          :fields="requestFields"
          title="Resend verification email"
          :description="requestDescription"
          icon="i-lucide-mail-check"
          @submit="onRequestSubmit"
        >
          <template #validation>
            <UAlert
              v-if="requestSuccessMessage"
              color="success"
              icon="i-lucide-circle-check"
              :title="requestSuccessMessage"
            />
            <UAlert
              v-else-if="requestErrorMessage"
              color="error"
              icon="i-lucide-alert-circle"
              :title="requestErrorMessage"
            />
          </template>

          <template #submit="{ loading }">
            <UButton
              type="submit"
              label="Send verification link"
              :loading="loading"
              block
            />
          </template>

          <template #footer>
            Already verified?
            <ULink
              to="/login"
              class="text-primary font-medium"
            >
              Sign in
            </ULink>
          </template>
        </UAuthForm>
      </template>
    </UPageCard>
  </UContainer>
</template>

<script lang="ts" setup>
import z from 'zod/v4'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  title: 'Verify Email',
  description: 'Verify your email address',
})

const route = useRoute()
const { loggedIn, fetch: refreshSession } = useUserSession()

const token = computed(() => {
  const value = route.query.token
  return typeof value === 'string' && value.length ? value : undefined
})

const status = useState<'idle' | 'loading' | 'success' | 'error'>('verify-email-status', () => token.value ? 'loading' : 'idle')
const statusMessage = useState<string>('verify-email-message', () => '')

const requestErrorMessage = useState<string>('verify-email-request-error', () => '')
const requestSuccessMessage = useState<string>('verify-email-request-success', () => '')

const requestSchema = z.object({
  email: z.email('Please enter a valid email address'),
})

type RequestSchema = z.output<typeof requestSchema>

const requestFields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email' as const,
    label: 'Email',
    placeholder: 'Enter your email address',
    required: true,
    autocomplete: 'email',
  },
]

const requestDescription = computed(() => {
  if (status.value === 'error') {
    return 'Enter your email address and we will send a new verification link.'
  }

  return 'Need a new verification link? We can send another email.'
})

async function verifyEmail() {
  if (!token.value) {
    status.value = 'idle'
    return
  }

  status.value = 'loading'
  statusMessage.value = ''

  try {
    const response = await $fetch<{ message?: string }>('/api/auth/email/verify', {
      method: 'POST',
      body: { token: token.value },
    })

    status.value = 'success'
    statusMessage.value = response.message || 'Your email has been verified successfully.'
  }
  catch (error) {
    const message = getErrorMessage(error, 'Verification failed. Please request a new link.')

    if (message.toLowerCase().includes('already verified')) {
      status.value = 'success'
      statusMessage.value = message
    }
    else {
      status.value = 'error'
      statusMessage.value = message
      return
    }
  }

  try {
    await refreshSession()
  }
  catch {
    // Session refresh failure should not block successful verification.
  }
}

async function onRequestSubmit(event: FormSubmitEvent<RequestSchema>) {
  requestErrorMessage.value = ''
  requestSuccessMessage.value = ''

  try {
    const response = await $fetch<{ message?: string }>('/api/auth/email/request', {
      method: 'POST',
      body: { email: event.data.email },
    })

    requestSuccessMessage.value = response.message || 'Verification email sent. Please check your inbox.'
  }
  catch (error) {
    requestErrorMessage.value = getErrorMessage(error, 'Failed to send verification email. Please try again.')
  }
}

onMounted(() => {
  verifyEmail()
})
</script>
