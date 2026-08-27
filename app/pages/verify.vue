<script setup lang="ts">
import * as z from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

const route = useRoute()
const { refresh } = useAccount()

type Outcome = 'working' | 'verified' | 'expired' | 'sent'

const outcome = ref<Outcome>('working')
const notice = ref('')

const addressOnly = z.object({ email: z.string().email('Enter an email address') })
const addressField: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email address', autocomplete: 'email', required: true },
]

// An expired or spent link is an offer of a fresh one, never a dead end (A-102 criterion 3).
onMounted(async () => {
  const token = route.query.token
  if (typeof token !== 'string' || !token) {
    outcome.value = 'expired'
    notice.value = 'That link is incomplete. Ask for a new one.'
    return
  }

  try {
    await $fetch('/api/auth/verify', { method: 'POST', body: { token } })
    await refresh()
    outcome.value = 'verified'
  }
  catch (error) {
    notice.value = refusalText(error)
    outcome.value = 'expired'
  }
})

async function resend(payload: FormSubmitEvent<z.output<typeof addressOnly>>): Promise<void> {
  const result = await $fetch<{ message: string }>('/api/auth/verify/resend', { method: 'POST', body: payload.data })
  notice.value = result.message
  outcome.value = 'sent'
}

useSeoMeta({ title: 'Confirm your address' })
</script>

<template>
  <UContainer class="max-w-md py-16">
    <UPageCard>
      <div
        v-if="outcome === 'working'"
        class="flex items-center gap-3 text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin"
        />
        <span>Confirming your address.</span>
      </div>

      <div
        v-else-if="outcome === 'verified'"
        data-test="verified"
        class="space-y-3"
      >
        <h1 class="nnt-headline text-xl">
          Address confirmed
        </h1>
        <p class="text-muted">
          Your account is ready. You can sign in whenever you like.
        </p>
        <UButton to="/sign-in">
          Sign in
        </UButton>
      </div>

      <div
        v-else-if="outcome === 'sent'"
        class="space-y-2"
      >
        <h1 class="nnt-headline text-xl">
          Check your email
        </h1>
        <p class="text-muted">
          {{ notice }}
        </p>
      </div>

      <div
        v-else
        data-test="token-expired"
        class="space-y-4"
      >
        <div class="space-y-2">
          <h1 class="nnt-headline text-xl">
            That link has expired
          </h1>
          <p class="text-muted">
            {{ notice }}
          </p>
        </div>

        <UAuthForm
          title="Send me a new one"
          :schema="addressOnly"
          :fields="addressField"
          :submit="{ label: 'Send a new link' }"
          @submit="resend"
        />
      </div>
    </UPageCard>
  </UContainer>
</template>
