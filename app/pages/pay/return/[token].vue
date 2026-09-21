<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { attemptIdFromKey, readSumupReturn, saysAttemptStatus } from '#shared/utils/sumup'
import type { SumupAttemptStatus } from '#shared/utils/sumup'

// Where the SumUp app comes back to (F-124 criterion 3). It may land in a browser holding no
// session, so the attempt's own signed key in the path is what the answer is accepted on.
definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Recording your payment', description: 'Where SumUp returns a bar payment to the till.', robots: 'noindex' })

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
    refusal.value = 'SumUp sent no answer with this link. Open the till and say whether the payment went through.'
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
    case 'SUCCEEDED': return 'The till has it. Close this page.'
    case 'FAILED': return 'SumUp says the payment did not go through. The basket is back on the till.'
    case 'MISMATCH': return `${answer.value.error ?? 'The sale was not recorded.'} Tell the duty manager: the reader took this money and the till has no record of it.`
    case 'ABANDONED': return 'This one was already given up on. If the reader took the money, ring it up again on the till.'
    default: return 'The till is recording it.'
  }
})
</script>

<template>
  <NightScreen title="Payment">
    <div data-test="pay-return">
      <p
        v-if="outcome === 'working'"
        class="text-muted"
        data-test="pay-return-working"
      >
        Checking with the till&hellip;
      </p>

      <template v-else-if="outcome === 'answered' && answer">
        <h2
          class="text-xl font-semibold"
          :data-test="`pay-return-${answer.status.toLowerCase()}`"
        >
          {{ headline }}
        </h2>
        <p class="mt-2 text-muted">
          {{ detail }}
        </p>
      </template>

      <template v-else>
        <h2 class="text-xl font-semibold">
          Not recorded here
        </h2>
        <UAlert
          class="mt-3"
          color="warning"
          variant="subtle"
          :description="refusal ?? 'That link has expired.'"
          data-test="pay-return-refused"
        />
      </template>
    </div>

    <template #actions>
      <UButton
        to="/tonight/till"
        class="min-h-12"
        block
        data-test="pay-return-till"
      >
        Back to the till
      </UButton>
    </template>
  </NightScreen>
</template>
