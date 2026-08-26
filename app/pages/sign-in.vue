<script setup lang="ts">
const route = useRoute()

// The Google route redirects here with a code rather than a sentence, so the wording lives on
// the page that shows it (A-104).
const REFUSALS: Record<string, string> = {
  'not-workspace': 'Only @newtheatre.org.uk accounts sign in with Google. Members use an email address and password.',
  'unverified-email': 'That Google account has an unverified address.',
  'disabled': 'That account cannot sign in. Ask the IT Manager.',
  'linked-elsewhere': 'That Google identity is already on another account. Those two need merging first.',
  'google': 'Google sign-in is unavailable at the moment.',
}

const refusal = computed(() => {
  const code = route.query.refused
  return typeof code === 'string' ? REFUSALS[code] ?? 'That sign-in was refused.' : null
})

useSeoMeta({ title: 'Sign in' })
</script>

<template>
  <UContainer class="max-w-md py-16">
    <h1 class="nnt-headline mb-6 text-2xl">
      Sign in
    </h1>

    <UAlert
      v-if="refusal"
      class="mb-6"
      color="error"
      variant="subtle"
      title="Not signed in"
      :description="refusal"
    />

    <UButton
      to="/auth/google"
      external
      block
      size="lg"
      icon="i-simple-icons-google"
    >
      Sign in with Google
    </UButton>

    <p class="mt-4 text-sm text-muted">
      Committee accounts on @newtheatre.org.uk sign in with Google. Everyone else uses an email
      address and a password.
    </p>
  </UContainer>
</template>
