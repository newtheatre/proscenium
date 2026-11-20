<!-- Where an address verification link lands (ID-12). It sits with the sign-in pages, outside the
     account shell, because the link works without a session. The token is in the fragment, so it never
     reaches a server log, and it is posted only on a press, because mail scanners open links in a real browser. -->
<script setup lang="ts">
import type { Refusal } from '../../utils/identity'

useSeoMeta({ title: 'Confirm your address' })
const refusal = ref<Refusal | null>(null)
const done = ref(false)
const token = ref('')

onMounted(() => {
  token.value = window.location.hash.slice(1)
  // Vue Router keeps its own data in the history state, so it is passed back rather than cleared.
  history.replaceState(history.state, '', window.location.pathname + window.location.search)
})

async function finish() {
  refusal.value = null
  const answer = await callIdentity<{ verified: true }>('/api/core/me/addresses/verify', { token: token.value })
  if (!answer.ok) refusal.value = answer.refusal
  else done.value = true
}
</script>

<template>
  <IdentityCard title="Confirm your address">
    <RefusalNotice :refusal="refusal" />
    <p
      v-if="done"
      class="text-sm"
      aria-live="polite"
    >
      Your address is confirmed. You can close this page.
    </p>
    <UButton
      v-if="done || refusal"
      block
      to="/account/email"
      color="neutral"
      variant="outline"
    >
      {{ done ? 'Go to your email addresses' : 'Send a new link from your account' }}
    </UButton>
    <template v-else-if="!refusal">
      <p class="text-sm text-muted">
        Press Confirm address to finish adding it to your account.
      </p>
      <UButton
        block
        label="Confirm address"
        loading-auto
        @click="finish()"
      />
    </template>
  </IdentityCard>
</template>
