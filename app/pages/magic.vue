<script setup lang="ts">
const route = useRoute()
const { refresh } = useAccount()

type Outcome = 'working' | 'challenge' | 'expired'

const outcome = ref<Outcome>('working')
const notice = ref('')
const attemptId = ref('')

// A link replaces the password step and never the second factor (A-107 criterion 4).
onMounted(async () => {
  const token = route.query.token
  if (typeof token !== 'string' || !token) {
    outcome.value = 'expired'
    notice.value = 'That link is incomplete. Ask for a new one.'
    return
  }

  try {
    const result = await $fetch('/api/auth/magic-link/consume', { method: 'POST', body: { token } })
    if (result.mfaRequired) {
      attemptId.value = result.attemptId
      outcome.value = 'challenge'
      return
    }
    await signedIn()
  }
  catch (error) {
    notice.value = refusalText(error)
    outcome.value = 'expired'
  }
})

// Only a path on this site: an absolute URL here would make the link an open redirect.
const nextPath = computed(() => {
  const next = route.query.next
  return typeof next === 'string' && /^\/(?!\/)/.test(next) ? next : '/'
})

const askAgain = computed(() =>
  nextPath.value === '/' ? '/sign-in?method=link' : `/sign-in?method=link&next=${encodeURIComponent(nextPath.value)}`)

async function signedIn(): Promise<void> {
  await refresh()
  await navigateTo(nextPath.value)
}

useSeoMeta({
  title: 'Signing you in',
  description: 'Finishing a sign-in from the link sent to your email address.',
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
      <span>Signing you in.</span>
    </div>

    <MfaChallenge
      v-else-if="outcome === 'challenge'"
      :attempt-id="attemptId"
      @answered="signedIn"
    />

    <div
      v-else
      data-test="token-expired"
      class="space-y-3"
    >
      <h1 class="nnt-headline text-xl">
        That link has expired
      </h1>
      <p class="text-muted">
        {{ notice }}
      </p>
      <UButton
        :to="askAgain"
        data-test="ask-again"
      >
        Ask for a new one
      </UButton>
    </div>
  </WayIn>
</template>
