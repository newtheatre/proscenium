<!-- Where an emailed link lands. The token is in the fragment, so it never reaches a server log. -->
<script setup lang="ts">
import type { Refusal } from '../../composables/useIdentity'

useSeoMeta({ title: 'Signing you in' })
const refusal = ref<Refusal | null>(null)

onMounted(async () => {
  const token = window.location.hash.slice(1)
  history.replaceState(null, '', window.location.pathname)
  const answer = await callIdentity<{ next: string, offerPasskey: boolean }>('/api/core/sign-in/link', { token })
  if (!answer.ok) {
    refusal.value = answer.refusal
    return
  }
  if (answer.data.offerPasskey) return navigateTo({ path: '/account/passkey', query: { next: answer.data.next } })
  return navigateTo(answer.data.next)
})
</script>

<template>
  <IdentityCard title="Signing you in">
    <RefusalNotice :refusal="refusal" />
    <UButton
      v-if="refusal"
      to="/sign-in"
      color="neutral"
      variant="outline"
    >
      Back to sign in
    </UButton>
    <p
      v-else
      class="text-sm text-muted"
      aria-live="polite"
    >
      One moment.
    </p>
  </IdentityCard>
</template>
