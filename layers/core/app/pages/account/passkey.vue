<!-- The passkey offer after an email sign-in (ID-03). Skippable; staff are told the console needs one. -->
<script setup lang="ts">
import type { Refusal } from '../../composables/useIdentity'

useSeoMeta({ title: 'Add a passkey' })
const route = useRoute()
const next = nextPath(route.query.next) ?? '/'
const refusal = ref<Refusal | null>(null)
const busy = ref(false)
const codes = ref<string[] | null>(null)
const { data: me } = await useFetch<{ signedIn: boolean, consoleNeedsPasskey?: boolean }>('/api/core/me')
if (!me.value?.signedIn) await navigateTo({ path: '/sign-in', query: { next: route.fullPath } })

async function add() {
  busy.value = true
  refusal.value = null
  const answer = await addMyPasskey()
  busy.value = false
  if (!answer.ok) {
    if (answer.refusal.code === 'core.access.not-fresh') return navigateTo({ path: '/sign-in/confirm', query: { next: route.fullPath } })
    refusal.value = answer.refusal
    return
  }
  if (answer.data.recoveryCodes?.length) codes.value = answer.data.recoveryCodes
  else return navigateTo(next)
}
</script>

<template>
  <IdentityCard
    title="Add a passkey"
    :description="codes ? undefined : 'A passkey lets you sign in with your fingerprint, face or screen lock instead of waiting for an email.'"
  >
    <template v-if="!codes">
      <UAlert
        v-if="me?.consoleNeedsPasskey"
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="You will need a passkey to use the console."
      />
      <RefusalNotice :refusal="refusal" />
      <UButton
        block
        icon="i-lucide-key-round"
        :loading="busy"
        @click="add"
      >
        Add a passkey
      </UButton>
      <UButton
        block
        color="neutral"
        variant="link"
        :to="next"
      >
        Not now
      </UButton>
    </template>
    <RecoveryCodes
      v-else
      :codes="codes"
      check-path="/api/core/me/recovery-codes/check"
      @kept="navigateTo(next)"
    />
  </IdentityCard>
</template>
