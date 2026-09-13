<script setup lang="ts">
import { PASS_ADMISSION_CAPTION, PASS_ADMISSION_PARTY_SIZE } from '#shared/utils/door'
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
      verdict: { state: 'REFUSED', headline: 'REFUSED', line: refusalText(refused), note: null },
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

      <template v-else>
        <!-- Gold, filled, with ash text on top: the one admit button on the screen it belongs to
             (docs/design-language.md, the gold contrast floor). -->
        <UButton
          size="xl"
          block
          icon="i-lucide-check"
          :loading="admitting === pass.id"
          class="min-h-12 bg-gold-400 text-ash-950 hover:bg-gold-300 focus-visible:bg-gold-300"
          :data-test="`pass-admit-${pass.reference}`"
          @click="admit(pass)"
        >
          Admit, party of {{ PASS_ADMISSION_PARTY_SIZE }}
        </UButton>
        <p class="text-center text-xs text-muted">
          {{ PASS_ADMISSION_CAPTION }}
        </p>
      </template>
    </div>

    <!-- The wording D-126 criterion 2 asks for, standing whether or not a card is on screen: the
         answer to a refused pass is the bar, not an argument at the door. -->
    <div
      class="rounded-xl border border-error/40 bg-error/5 p-4"
      data-test="pass-refusal-panel"
    >
      <p class="text-sm font-semibold text-error">
        If Admit is refused
      </p>
      <p class="mt-1 text-sm text-muted">
        The screen says why in plain words: already used tonight, pass expired, show not covered.
        The answer is always the bar, never an argument at the door.
      </p>
    </div>
  </div>
</template>
