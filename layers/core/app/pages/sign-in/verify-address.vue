<!-- Where an address verification link lands (ID-12). It sits with the sign-in pages, outside the
     account shell, because the link works without a session. The token is in the fragment, so it never
     reaches a server log, and it is posted only on a press, because mail scanners open links in a real browser. -->
<script setup lang="ts">
import type { Refusal } from '../../utils/identity'

const { t } = useT()
useSeoMeta({ title: () => t('core.verify-address.title') })
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
  <IdentityCard :title="t('core.verify-address.title')">
    <RefusalNotice :refusal="refusal" />
    <p
      v-if="done"
      class="text-sm"
      aria-live="polite"
    >
      {{ t('core.verify-address.done') }}
    </p>
    <UButton
      v-if="done || refusal"
      block
      to="/account/details#email"
      color="neutral"
      variant="outline"
      :label="done ? t('core.verify-address.go') : t('core.verify-address.new-link')"
    />
    <template v-else-if="!refusal">
      <p class="text-sm text-muted">
        {{ t('core.verify-address.press') }}
      </p>
      <UButton
        block
        :label="t('core.verify-address.confirm')"
        loading-auto
        @click="finish()"
      />
    </template>
  </IdentityCard>
</template>
