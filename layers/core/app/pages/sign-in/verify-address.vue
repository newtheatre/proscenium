<!-- Where an address verification link lands (ID-12). It sits with the sign-in pages, outside the
     account shell, because the link works without a session. The token is in the fragment, so it never
     reaches a server log, and the page posts it, so a mail scanner that opens the link spends nothing. -->
<script setup lang="ts">
import type { Refusal } from '../../utils/identity'

useSeoMeta({ title: 'Confirming your address' })
const refusal = ref<Refusal | null>(null)
const done = ref(false)

onMounted(async () => {
  const token = window.location.hash.slice(1)
  // Vue Router keeps its own data in the history state, so it is passed back rather than cleared.
  history.replaceState(history.state, '', window.location.pathname + window.location.search)
  const answer = await callIdentity<{ verified: true }>('/api/core/me/addresses/verify', { token })
  if (!answer.ok) refusal.value = answer.refusal
  else done.value = true
})
</script>

<template>
  <IdentityCard title="Confirming your address">
    <RefusalNotice :refusal="refusal" />
    <p
      v-if="done"
      class="text-sm"
      aria-live="polite"
    >
      Your address is confirmed. You can close this page.
    </p>
    <p
      v-else-if="!refusal"
      class="text-sm text-muted"
      aria-live="polite"
    >
      One moment.
    </p>
  </IdentityCard>
</template>
