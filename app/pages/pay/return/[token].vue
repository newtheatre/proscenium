<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { attemptIdFromKey, readSumupReturn, saysAttemptStatus } from '#shared/utils/sumup'
import type { SumupAttemptStatus } from '#shared/utils/sumup'

// Where the SumUp app comes back to (F-124 criterion 3). It may land in a browser holding no
// session, so the attempt's own signed key in the path is what the answer is accepted on.
useSeoMeta({ title: 'Recording your payment', description: 'Where the SumUp app returns a bar payment to the till.', robots: 'noindex' })

interface Answer { status: SumupAttemptStatus, error: string | null, totalPence: number, receipt: { totalPence: number } | null }

const route = useRoute()
const outcome = ref<'working' | 'answered' | 'refused'>('working')
const answer = ref<Answer | null>(null)
const refusal = ref<string | null>(null)

const token = computed(() => (typeof route.params.token === 'string' ? route.params.token : ''))
const attemptId = computed(() => attemptIdFromKey(token.value))

onMounted(async () => {
  const read = readSumupReturn(window.location.search)
  if (!read.smpStatus) {
    outcome.value = 'refused'
    refusal.value = 'The SumUp app sent no answer with this link. Open the till and say whether the payment went through.'
    return
  }
  try {
    answer.value = await $fetch<Answer>(`/api/till/payments/${attemptId.value}/complete`, {
      method: 'POST',
      body: { ...read, key: token.value },
    })
    outcome.value = 'answered'
  }
  catch (error) {
    outcome.value = 'refused'
    refusal.value = refusalText(error)
  }
})

const headline = computed(() => {
  if (!answer.value) return ''
  switch (answer.value.status) {
    case 'SUCCEEDED': return `Recorded: ${saysMoney(answer.value.receipt?.totalPence ?? answer.value.totalPence)}`
    case 'FAILED': return 'Not taken'
    case 'MISMATCH': return 'Taken on the reader, not recorded'
    default: return saysAttemptStatus(answer.value.status)
  }
})

const detail = computed(() => {
  if (!answer.value) return ''
  switch (answer.value.status) {
    case 'SUCCEEDED': return 'The sale is on the ledger. You can close this page; the till has it.'
    case 'FAILED': return 'The SumUp app reported the payment did not go through. The basket is back on the till.'
    case 'MISMATCH': return `${answer.value.error ?? 'The sale could not be recorded.'} Tell the duty manager: the reader has this money and the ledger does not.`
    case 'ABANDONED': return 'This hand-off was already abandoned. If the reader did take the money, ring it up again on the till.'
    default: return 'The till is recording it.'
  }
})
</script>

<template>
  <UContainer class="py-10">
    <UPageCard
      class="mx-auto max-w-md"
      data-test="pay-return"
    >
      <p
        v-if="outcome === 'working'"
        class="text-muted"
        data-test="pay-return-working"
      >
        Checking with the till&hellip;
      </p>

      <template v-else-if="outcome === 'answered' && answer">
        <h1
          class="nnt-headline text-2xl"
          :data-test="`pay-return-${answer.status.toLowerCase()}`"
        >
          {{ headline }}
        </h1>
        <p class="mt-2 text-muted">
          {{ detail }}
        </p>
      </template>

      <template v-else>
        <h1 class="nnt-headline text-2xl">
          Not recorded here
        </h1>
        <UAlert
          class="mt-3"
          color="warning"
          variant="subtle"
          :description="refusal ?? 'That link has expired.'"
          data-test="pay-return-refused"
        />
      </template>

      <UButton
        to="/tonight/till"
        class="mt-6 min-h-12"
        block
        data-test="pay-return-till"
      >
        Back to the till
      </UButton>
    </UPageCard>
  </UContainer>
</template>
