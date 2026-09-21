<script setup lang="ts">
import { doorFailureVerdict } from '#shared/utils/door'
import type { DoorVerdict } from '#shared/utils/door'

// Admitting a pass holder (D-126). The search and the card; the verdict afterwards is the door
// screen's own, so one admission reads the same whichever way the reference arrived.
const props = defineProps<{ performanceId: string, prefill?: string }>()
const emit = defineEmits<{ admitted: [result: PassAdmission] }>()

interface PassCard {
  id: string
  reference: string
  holderName: string
  passTypeName: string
  covers: string
  active: boolean
  tonight: string
  admittedTonight: boolean
  lastUsed: string | null
  refusal: string | null
}

interface PassAdmission { reference: string, verdict: DoorVerdict, holderName: string | null, partySize: number }

const term = ref(props.prefill ?? '')
const settled = useDebounced(term, 300)
const items = ref<PassCard[]>([])
const searching = ref(false)
const failure = ref<string | null>(null)
const admitting = ref<string | null>(null)

async function search(): Promise<void> {
  const q = settled.value.trim()
  if (q.length < 2) {
    items.value = []
    return
  }
  searching.value = true
  failure.value = null
  try {
    const found = await $fetch<{ items: PassCard[] }>('/api/tonight/door/passes/search', {
      query: { q, performanceId: props.performanceId },
    })
    items.value = found.items
  }
  catch (refused) {
    failure.value = refusalText(refused)
    items.value = []
  }
  finally {
    searching.value = false
  }
}

watch(settled, search, { immediate: true })

async function admit(pass: PassCard): Promise<void> {
  admitting.value = pass.id
  try {
    const result = await $fetch<PassAdmission>('/api/tonight/door/passes/scan', {
      method: 'POST',
      body: { reference: pass.reference, performanceId: props.performanceId },
    })
    emit('admitted', { ...result, holderName: pass.holderName })
  }
  catch (refused) {
    emit('admitted', {
      reference: pass.reference,
      verdict: doorFailureVerdict(refusalStatus(refused), refusalText(refused)),
      holderName: pass.holderName,
      partySize: 0,
    })
  }
  finally {
    admitting.value = null
  }
}
</script>

<template>
  <div
    class="space-y-4"
    data-test="door-pass-mode"
  >
    <UInput
      v-model="term"
      class="w-full"
      size="xl"
      icon="i-lucide-search"
      placeholder="Holder's name, or the reference on the pass"
      aria-label="Search pass holders"
      data-test="pass-search"
    />

    <UAlert
      v-if="failure"
      color="error"
      variant="subtle"
      :description="failure"
      data-test="pass-search-failure"
    />

    <p
      v-else-if="settled.trim().length >= 2 && items.length === 0 && !searching"
      class="text-muted"
      data-test="pass-search-empty"
    >
      No pass matches that. Try the holder's name, or the reference printed on the pass.
    </p>

    <div
      v-for="pass in items"
      :key="pass.id"
      class="space-y-3 rounded-xl border border-default bg-elevated p-4"
      :data-test="`pass-card-${pass.reference}`"
    >
      <div class="flex items-start justify-between gap-3">
        <p class="nnt-headline text-xl">
          {{ pass.holderName }}
        </p>
        <UBadge
          :color="pass.active ? 'success' : 'error'"
          variant="subtle"
          size="sm"
        >
          {{ pass.active ? 'Active' : 'Not active' }}
        </UBadge>
      </div>

      <p class="font-mono text-sm text-muted">
        {{ pass.reference }} · {{ pass.passTypeName }}
      </p>

      <dl class="space-y-1 text-sm">
        <div class="flex justify-between gap-3">
          <dt class="text-muted">
            Covers
          </dt>
          <dd class="text-right">
            {{ pass.covers }}
          </dd>
        </div>
        <div class="flex justify-between gap-3">
          <dt class="text-muted">
            Tonight
          </dt>
          <dd
            class="text-right"
            :class="pass.admittedTonight ? 'text-warning' : 'text-success'"
            :data-test="`pass-tonight-${pass.reference}`"
          >
            {{ pass.tonight }}
          </dd>
        </div>
        <div
          v-if="pass.lastUsed"
          class="flex justify-between gap-3"
        >
          <dt class="text-muted">
            Last used
          </dt>
          <dd class="text-right">
            {{ pass.lastUsed }}
          </dd>
        </div>
      </dl>

      <UAlert
        v-if="pass.refusal"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-x"
        :description="pass.refusal"
        :data-test="`pass-refusal-${pass.reference}`"
      />

      <!-- The limelight, filled, through the theme's own secondary and never a scale name. A pass
           admits its holder and nobody else, so the label names no count (D-126 criterion 4). -->
      <UButton
        v-else
        size="xl"
        block
        color="secondary"
        icon="i-lucide-check"
        :loading="admitting === pass.id"
        class="min-h-12"
        :data-test="`pass-admit-${pass.reference}`"
        @click="admit(pass)"
      >
        Admit one
      </UButton>
    </div>
  </div>
</template>
