<script setup lang="ts">
import * as z from 'zod'
import { localPath } from '#shared/utils/local-path'
import { landingAfterSignIn } from '#shared/utils/night-authority'
import { withNext } from '#shared/utils/sign-in'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

const route = useRoute()
const { account, refresh } = useAccount()

type Outcome = 'working' | 'verified' | 'expired' | 'sent'

const outcome = ref<Outcome>('working')
const notice = ref('')

const addressOnly = z.object({ email: z.string().email('Enter an email address') })
const addressField: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email address', autocomplete: 'email', required: true },
]

// Opened in the browser that registered, the link signs in too and goes on to next (0103).
onMounted(async () => {
  const token = route.query.token
  if (typeof token !== 'string' || !token) {
    outcome.value = 'expired'
    notice.value = 'That link is incomplete.'
    return
  }

  try {
    const result = await $fetch('/api/auth/verify', { method: 'POST', body: { token } })
    await refresh()
    if (result.signedIn) {
      await navigateTo(landingAfterSignIn(route.query.next, account.value.onShiftTonight))
      return
    }
    outcome.value = 'verified'
  }
  catch (error) {
    notice.value = refusalText(error)
    outcome.value = 'expired'
  }
})

// A sign-in link confirms the address as it signs in, so it is the fresh send an expired link
// offers rather than a dead end (A-102 criterion 3, 0103).
async function sendLink(payload: FormSubmitEvent<z.output<typeof addressOnly>>): Promise<void> {
  const next = localPath(route.query.next) ?? undefined
  const result = await $fetch<{ message: string }>('/api/auth/magic-link/request', { method: 'POST', body: { ...payload.data, next } })
  notice.value = result.message
  outcome.value = 'sent'
}

useSeoMeta({
  title: 'Confirm your address',
  description: 'Confirming the email address on a Nottingham New Theatre account.',
})
</script>

<template>
  <WayIn>
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
        Your account is ready. Sign in to carry on.
      </p>
      <UButton
        :to="withNext('/sign-in', route.query.next)"
        class="min-h-11"
      >
        Sign in
      </UButton>
    </div>

    <div
      v-else-if="outcome === 'sent'"
      data-test="check-your-email"
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
          {{ notice }} A sign-in link confirms your address and signs you in at once.
        </p>
      </div>

      <UAuthForm
        :schema="addressOnly"
        :fields="addressField"
        :submit="{ label: 'Email me a sign-in link', class: 'min-h-11' }"
        @submit="sendLink"
      />
    </div>
  </WayIn>
</template>
