<!-- Where the link that confirms an erasure lands (ID-16). It sits with the sign-in pages because the
     link works without a session. The token is in the fragment, so it never reaches a server log,
     and it is posted only on a press, because mail scanners open links in a real browser. -->
<script setup lang="ts">
import type { Refusal } from '../../utils/identity'

const { t } = useT()
const { dayLong } = useDates()
useSeoMeta({ title: () => t('core.confirm-erasure.title') })
const refusal = ref<Refusal | null>(null)
const answer = ref<{ notBefore: number, holds: string[] } | null>(null)
const token = ref('')

onMounted(() => {
  token.value = window.location.hash.slice(1)
  // Vue Router keeps its own data in the history state, so it is passed back rather than cleared.
  history.replaceState(history.state, '', window.location.pathname + window.location.search)
})

async function finish() {
  refusal.value = null
  const result = await callIdentity<{ notBefore: number, holds: string[] }>('/api/core/me/data-requests/confirm', { token: token.value })
  if (!result.ok) refusal.value = result.refusal
  else answer.value = result.data
}
</script>

<template>
  <IdentityCard :title="t('core.confirm-erasure.title')">
    <RefusalNotice :refusal="refusal" />
    <div
      v-if="answer"
      class="space-y-2 text-sm"
      aria-live="polite"
    >
      <p>
        {{ t('core.confirm-erasure.done', { date: dayLong(answer.notBefore) }) }}
      </p>
      <p v-if="answer.holds.length">
        {{ t('core.confirm-erasure.held') }}
      </p>
    </div>
    <UButton
      v-if="answer || refusal"
      block
      to="/account/data"
      color="neutral"
      variant="outline"
      :label="answer ? t('core.confirm-erasure.go') : t('core.confirm-erasure.see')"
    />
    <template v-if="!answer && !refusal">
      <p class="text-sm text-muted">
        {{ t('core.confirm-erasure.press') }}
      </p>
      <UButton
        block
        :label="t('core.confirm-erasure.confirm')"
        loading-auto
        @click="finish()"
      />
    </template>
  </IdentityCard>
</template>
