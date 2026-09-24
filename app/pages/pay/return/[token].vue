<script setup lang="ts">
import { attemptIdFromKey, readSumupReturn, sumupReturnWords, tillReturnPath } from '#shared/utils/sumup'
import type { SumupAttemptStatus } from '#shared/utils/sumup'

// Where the SumUp app comes back to (F-124 criterion 3). It may land in a browser holding no
// session, so the attempt's own signed key in the path is what the answer is accepted on.
definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Recording your payment', description: 'Where SumUp returns a bar payment to the till.', robots: 'noindex' })

interface Answer { status: SumupAttemptStatus, error: string | null, venueId: string, totalPence: number, receipt: { totalPence: number } | null }

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

const words = computed(() => (answer.value
  ? sumupReturnWords({ status: answer.value.status, totalPence: answer.value.totalPence, receiptTotalPence: answer.value.receipt?.totalPence ?? null, error: answer.value.error })
  : null))

// A refusal names no venue; the till then falls back on the bar this device opened tonight.
const tillLink = computed(() => tillReturnPath(answer.value?.venueId ?? null, attemptId.value || null))
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
          {{ words?.headline }}
        </h2>
        <p class="mt-2 text-muted">
          {{ words?.detail }}
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
        :to="tillLink"
        class="min-h-12"
        block
        data-test="pay-return-till"
      >
        Back to the till
      </UButton>
    </template>
  </NightScreen>
</template>
