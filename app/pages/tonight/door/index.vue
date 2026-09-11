<script setup lang="ts">
import { saysPerformanceChoice } from '#shared/utils/tonight'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Door' })

interface CoveredPerformance { id: string, showTitle: string, startsAt: number, venueName: string, active: boolean }
interface Authority { performanceIds: string[], performances: CoveredPerformance[] }
interface TicketScanResult { decision: 'ADMIT', showTitle: string }
interface PassScanResult { decision: 'ADMIT', passTypeName: string }

const request = useRequestFetch()

const authorised = ref(false)
const authorityFailure = ref<string | null>(null)
const performances = ref<CoveredPerformance[]>([])
const performanceId = ref('')
const syncedAt = ref<Date | null>(null)
const busy = ref(true)

async function resolveAuthority(): Promise<void> {
  busy.value = true
  try {
    const resolved = await request<Authority>('/api/tonight/authority', { query: { role: 'DOOR' } })
    performances.value = resolved.performances
    // The house running now, never whichever id sorted first: a matinee ticket refused at an
    // evening the volunteer never chose is the bug this closes (issue 901).
    performanceId.value = (resolved.performances.find(one => one.active) ?? resolved.performances[0])?.id ?? ''
    authorised.value = true
    authorityFailure.value = null
  }
  catch (refused) {
    authorised.value = false
    authorityFailure.value = refusalText(refused)
  }
  finally {
    syncedAt.value = new Date()
    busy.value = false
  }
}

onMounted(resolveAuthority)

const performanceOptions = computed(() => performances.value.map(one => ({
  label: saysPerformanceChoice(one),
  value: one.id,
})))

// Typed or read from a hardware scanner acting as a keyboard (no camera scanner exists yet,
// docs/known-issues.md); a ticket and a pass share one reference alphabet, so one box tries both.
const reference = ref('')
const scanning = ref(false)
const admitted = ref<string | null>(null)
const refusal = ref<string | null>(null)

async function scan(): Promise<void> {
  if (!reference.value.trim() || !performanceId.value) return
  scanning.value = true
  admitted.value = null
  refusal.value = null
  const body = { reference: reference.value.trim(), performanceId: performanceId.value }
  try {
    const ticket = await $fetch<TicketScanResult>('/api/tonight/door/tickets/scan', { method: 'POST', body })
    admitted.value = ticket.showTitle
  }
  catch (ticketRefused) {
    // Only "no such booking" tries the reference as a pass instead; any other refusal (wrong
    // performance, unpaid, already admitted) is the answer, whichever kind of reference it was.
    if (refusalStatus(ticketRefused) !== 404) {
      refusal.value = refusalText(ticketRefused)
    }
    else {
      try {
        const pass = await $fetch<PassScanResult>('/api/tonight/door/passes/scan', { method: 'POST', body })
        admitted.value = pass.passTypeName
      }
      catch (passRefused) {
        refusal.value = refusalStatus(passRefused) === 404 ? 'That reference is not recognised' : refusalText(passRefused)
      }
    }
  }
  finally {
    reference.value = ''
    scanning.value = false
  }
}
</script>

<template>
  <NightScreen
    title="Door"
    hint="Scan or type a ticket or pass reference to admit it."
    :stale="syncedAt"
    :busy="busy"
    data-test="door-screen"
  >
    <div
      v-if="!authorised"
      class="space-y-3"
    >
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-lock"
        :description="authorityFailure ?? 'Resolving your authority for tonight…'"
        data-test="door-not-authorised"
      />
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <UFormField
        v-if="performanceOptions.length > 1"
        label="Performance"
      >
        <USelect
          v-model="performanceId"
          :items="performanceOptions"
          class="w-full"
          data-test="door-performance"
        />
      </UFormField>

      <UFormField label="Ticket or pass reference">
        <UInput
          v-model="reference"
          class="w-full"
          size="xl"
          autofocus
          placeholder="e.g. K7M4PQ"
          data-test="door-reference"
          @keyup.enter="scan"
        />
      </UFormField>

      <UAlert
        v-if="admitted"
        color="success"
        variant="subtle"
        icon="i-lucide-check-circle"
        title="Admit"
        :description="admitted"
        data-test="door-admit"
      />
      <UAlert
        v-if="refusal"
        color="error"
        variant="subtle"
        icon="i-lucide-x-circle"
        title="Refused"
        :description="refusal"
        data-test="door-refused"
      />

      <!-- Standalone reachability from the door, the half E-118 criterion 4 was still missing
           until this screen existed (issue 457). -->
      <UButton
        to="/tonight/age-checks"
        color="neutral"
        variant="subtle"
        icon="i-lucide-id-card"
        size="lg"
        class="min-h-12 w-full"
        data-test="link-age-checks"
      >
        Challenge 25
      </UButton>
    </div>

    <template #actions>
      <NightAction
        v-if="authorised"
        label="Scan"
        icon="i-lucide-scan-line"
        :loading="scanning"
        :disabled="!reference.trim() || !performanceId"
        data-test="door-scan"
        @press="scan"
      />
    </template>
  </NightScreen>
</template>
