<!-- Where an emailed link lands. The token is in the fragment, so it never reaches a server log. -->
<script setup lang="ts">
import type { Refusal } from '../../utils/identity'

useSeoMeta({ title: 'Signing you in' })
const refusal = ref<Refusal | null>(null)

onMounted(async () => {
  const token = window.location.hash.slice(1)
  // Vue Router keeps its own data in the history state, so it is passed back rather than cleared.
  history.replaceState(history.state, '', window.location.pathname + window.location.search)
  const answer = await callIdentity<{ next: string, offerPasskey: boolean }>('/api/core/sign-in/link', { token })
  if (!answer.ok) {
    refusal.value = answer.refusal
    return
  }
  return arriveSignedIn(answer.data)
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
