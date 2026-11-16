<!-- Where the link that confirms an erasure lands (ID-16). It sits with the sign-in pages because the
     link works without a session. The token is in the fragment, so it never reaches a server log,
     and the page posts it, so a mail scanner that opens the link confirms nothing. -->
<script setup lang="ts">
import type { Refusal } from '../../composables/useIdentity'

useSeoMeta({ title: 'Confirming erasure' })
const refusal = ref<Refusal | null>(null)
const answer = ref<{ notBefore: number, holds: string[] } | null>(null)
const when = computed(() => answer.value && new Date(answer.value.notBefore).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))

onMounted(async () => {
  const token = window.location.hash.slice(1)
  history.replaceState(null, '', window.location.pathname)
  const result = await callIdentity<{ notBefore: number, holds: string[] }>('/api/core/me/data-requests/confirm', { token })
  if (!result.ok) refusal.value = result.refusal
  else answer.value = result.data
})
</script>

<template>
  <IdentityCard title="Confirming erasure">
    <RefusalNotice :refusal="refusal" />
    <div
      v-if="answer"
      class="space-y-2 text-sm"
      aria-live="polite"
    >
      <p>Your erasure is confirmed. It will run on or after {{ when }}. Until then you can cancel it from your account.</p>
      <p v-if="answer.holds.length">
        Something needs to be settled first. Your account shows what it is.
      </p>
    </div>
    <p
      v-else-if="!refusal"
      class="text-sm text-muted"
      aria-live="polite"
    >
      One moment.
    </p>
  </IdentityCard>
</template>
