<script setup lang="ts">
import { PASS_TERMS_PATH, saysPassStatus } from '#shared/utils/passes'
import { saysDayRange } from '#shared/utils/when'
import type { PassStatus } from '#shared/utils/passes'

type Outcome = 'working' | 'found' | 'refused'

interface Pass {
  reference: string
  passType: string
  priceLabel: string
  pricePaid: string
  status: PassStatus
  validFrom: number
  validUntil: number
  qrSvg: string
  coveredShows: { title: string, slug: string }[]
}

const outcome = ref<Outcome>('working')
const pass = ref<Pass | null>(null)
const { account } = useAccount()

// A signed-in holder with no pass link open is sent to their own passes, each with its QR, rather
// than told to go and find it (issue 1332).
onMounted(async () => {
  try {
    pass.value = await $fetch<Pass>('/api/passes/current')
    outcome.value = 'found'
  }
  catch {
    if (account.value.signedIn) {
      await navigateTo('/account/passes', { replace: true })
      return
    }
    outcome.value = 'refused'
  }
})

const statusColor: Record<string, 'success' | 'neutral' | 'error'> = {
  ACTIVE: 'success',
  CANCELLED: 'error',
  EXPIRED: 'neutral',
}

// D-138 criterion 4: a new device asks for the email again; the answer never says what was found.
const resendEmail = ref('')
const resendSays = ref<string | null>(null)
const resending = ref(false)
async function resend(): Promise<void> {
  resending.value = true
  try {
    resendSays.value = (await $fetch<{ message: string }>('/api/passes/resend', { method: 'POST', body: { email: resendEmail.value.trim() } })).message
  }
  catch (error) {
    resendSays.value = refusalText(error)
  }
  finally {
    resending.value = false
  }
}

// D-138 criterion 5: for a shared computer.
async function forget(): Promise<void> {
  await $fetch('/api/passes/device', { method: 'DELETE' })
  pass.value = null
  outcome.value = 'refused'
}

useSeoMeta({
  title: 'Your pass',
  description: 'The pass held on this device, and what it admits you to.',
})
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
        <span>Finding your pass.</span>
      </div>

      <div
        v-else-if="outcome === 'found' && pass"
        data-test="pass-found"
        class="space-y-3"
      >
        <h1 class="nnt-headline text-xl">
          {{ pass.passType }}
        </h1>
        <p class="text-muted">
          {{ pass.priceLabel }}, {{ pass.pricePaid }}
        </p>
        <p class="text-sm text-muted">
          Reference {{ pass.reference }}
        </p>
        <p
          class="text-sm"
          data-test="pass-valid"
        >
          Valid {{ saysDayRange(pass.validFrom, pass.validUntil) }}
        </p>
        <UBadge
          data-test="pass-status"
          size="lg"
          :color="statusColor[pass.status] ?? 'neutral'"
        >
          {{ saysPassStatus(pass.status) }}
        </UBadge>
        <img
          :src="`data:image/svg+xml;base64,${pass.qrSvg}`"
          alt="Pass QR code"
          width="200"
          height="200"
          data-test="pass-qr"
        >
        <p class="text-xs text-muted">
          Save this image to keep the code, or show this page at the door.
        </p>

        <!-- D-135: booking ahead holds a seat; turning up is subject to space on the night. -->
        <div
          v-if="pass.status === 'ACTIVE'"
          class="space-y-2 border-t border-default pt-4"
          data-test="pass-book-ahead"
        >
          <h2 class="font-semibold">
            Book ahead with your pass
          </h2>
          <p class="text-sm text-muted">
            Booking holds you a seat at no charge. You can also just turn up and show this code, if there is space on the night.
          </p>
          <ul
            v-if="pass.coveredShows.length"
            class="list-disc pl-5 text-sm"
          >
            <li
              v-for="show in pass.coveredShows"
              :key="show.slug"
            >
              <NuxtLink
                :to="`/shows/${show.slug}`"
                class="underline"
              >
                {{ show.title }}
              </NuxtLink>
            </li>
          </ul>
          <p
            v-if="!account.signedIn"
            class="text-sm"
            data-test="pass-device-note"
          >
            This browser now keeps your pass, so booking here uses it without an account. On another phone or computer, open the link in your pass email there.
          </p>
          <p class="text-xs text-muted">
            <NuxtLink
              class="underline"
              :to="PASS_TERMS_PATH"
              data-test="pass-terms"
            >
              The ticket and pass terms
            </NuxtLink>
          </p>
        </div>
        <UButton
          v-if="!account.signedIn"
          size="sm"
          color="neutral"
          variant="link"
          class="px-0"
          data-test="pass-forget"
          @click="forget"
        >
          Forget passes on this device
        </UButton>
      </div>

      <div
        v-else
        data-test="pass-refused"
        class="space-y-3"
      >
        <h1 class="nnt-headline text-xl">
          No pass on this device
        </h1>
        <p class="text-muted">
          Open your pass from the email you were sent when it was issued, or sign in and it is under
          <NuxtLink
            to="/account/passes"
            class="underline"
          >Passes</NuxtLink>, with its QR code.
        </p>
        <form
          class="space-y-2 border-t border-default pt-3"
          data-test="pass-resend"
          @submit.prevent="resend"
        >
          <UFormField label="Lost the email? We will send it again">
            <UInput
              v-model="resendEmail"
              type="email"
              autocomplete="email"
              placeholder="The address the pass was sent to"
              class="w-full"
              data-test="pass-resend-email"
            />
          </UFormField>
          <UButton
            type="submit"
            size="sm"
            :loading="resending"
            :disabled="!resendEmail.trim()"
            data-test="pass-resend-send"
          >
            Email me my pass
          </UButton>
          <p
            v-if="resendSays"
            class="text-sm text-muted"
            role="status"
          >
            {{ resendSays }}
          </p>
        </form>
      </div>
    </UPageCard>
  </UContainer>
</template>
