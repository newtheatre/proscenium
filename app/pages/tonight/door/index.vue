<script setup lang="ts">
definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Door' })

interface Authority { performanceIds: string[] }
interface ScanResult { decision: 'ADMIT', passTypeName: string }

const request = useRequestFetch()

const authorised = ref(false)
const authorityFailure = ref<string | null>(null)
const performanceIds = ref<string[]>([])
const performanceId = ref('')
const syncedAt = ref<Date | null>(null)
const busy = ref(true)

async function resolveAuthority(): Promise<void> {
  busy.value = true
  try {
    const resolved = await request<Authority>('/api/tonight/authority', { query: { role: 'DOOR' } })
    performanceIds.value = resolved.performanceIds
    performanceId.value = resolved.performanceIds[0] ?? ''
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

const performanceOptions = computed(() => performanceIds.value.map(id => ({ label: id, value: id })))

// A pass reference is typed or read from a hardware scanner acting as a keyboard (no camera
// scanner exists anywhere in this build yet, docs/known-issues.md); either way it lands here.
const reference = ref('')
const scanning = ref(false)
const result = ref<ScanResult | null>(null)
const refusal = ref<string | null>(null)

async function scan(): Promise<void> {
  if (!reference.value.trim() || !performanceId.value) return
  scanning.value = true
  result.value = null
  refusal.value = null
  try {
    result.value = await $fetch<ScanResult>(`/api/tonight/door/passes/scan`, {
      method: 'POST',
      body: { reference: reference.value.trim(), performanceId: performanceId.value },
    })
  }
  catch (refused) {
    refusal.value = refusalText(refused)
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
    hint="Scan or type a pass's reference to admit it."
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

      <UFormField label="Pass reference">
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
        v-if="result"
        color="success"
        variant="subtle"
        icon="i-lucide-check-circle"
        title="Admit"
        :description="result.passTypeName"
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
