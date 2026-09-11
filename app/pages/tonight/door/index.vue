<script setup lang="ts">
import { saysDoorParty } from '#shared/utils/door'
import { saysPerformanceChoice } from '#shared/utils/tonight'
import type { DoorVerdict } from '#shared/utils/door'
import type { ScannerFailure } from '~/composables/useQrScanner'

definePageMeta({ layout: 'tonight' })
useSeoMeta({ title: 'Door' })

interface CoveredPerformance { id: string, showTitle: string, startsAt: number, venueName: string, active: boolean }
interface Authority { performanceIds: string[], performances: CoveredPerformance[] }
interface ScanResult { decision: 'ADMIT', reference: string, verdict: DoorVerdict, holderName: string | null, partySize: number }
interface RefusalData { verdict?: DoorVerdict, reference?: string, holderName?: string | null, partySize?: number }

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

// The camera is the door's default and the typed field its fallback, so a device with no camera
// lands on the field rather than on an apology (E-129 criteria 1, 5).
type Mode = 'CAMERA' | 'TYPING'
const mode = ref<Mode>('CAMERA')
const cameraNote = ref<string | null>(null)

const reference = ref('')
const scanning = ref(false)

interface Shown { verdict: DoorVerdict, reference: string, party: string | null }
const shown = ref<Shown | null>(null)

const cameraSays: Record<ScannerFailure, string> = {
  NO_CAMERA: 'No camera on this device, so type the reference.',
  REFUSED: 'Camera access refused, so type the reference.',
  BROKEN: 'The camera would not start, so type the reference.',
}

function fallBackToTyping(failure: ScannerFailure): void {
  cameraNote.value = cameraSays[failure]
  mode.value = 'TYPING'
}

function show(verdict: DoorVerdict, reference: string, holderName: string | null, partySize: number): void {
  shown.value = { verdict, reference, party: partySize > 0 ? saysDoorParty(holderName, partySize) : null }
}

// Whatever the lens read: this build's signed booking and pass URLs, the `/t/<ref>` form, or a
// bare reference. The signature is checked server-side, never here (criterion 2).
async function admitScanned(scanned: string): Promise<void> {
  if (scanning.value || !performanceId.value) return
  scanning.value = true
  try {
    const { reference: resolved } = await $fetch<{ reference: string }>('/api/tonight/door/resolve', {
      method: 'POST',
      body: { scanned, performanceId: performanceId.value },
    })
    await admit(resolved)
  }
  catch (refused) {
    show({ state: 'REFUSED', headline: 'NOT OURS', line: refusalText(refused), note: null }, '', null, 0)
  }
  finally {
    scanning.value = false
  }
}

async function admit(code: string): Promise<void> {
  const body = { reference: code, performanceId: performanceId.value }
  try {
    const ticket = await $fetch<ScanResult>('/api/tonight/door/tickets/scan', { method: 'POST', body })
    show(ticket.verdict, ticket.reference, ticket.holderName, ticket.partySize)
  }
  catch (ticketRefused) {
    // Only "no such booking" tries the reference as a pass instead; any other refusal (wrong
    // performance, unpaid, already admitted) is the answer, whichever kind of reference it was.
    if (refusalStatus(ticketRefused) !== 404) {
      showRefusal(ticketRefused, code)
      return
    }
    try {
      const pass = await $fetch<ScanResult>('/api/tonight/door/passes/scan', { method: 'POST', body })
      show(pass.verdict, pass.reference, pass.holderName, pass.partySize)
    }
    catch (passRefused) {
      if (refusalStatus(passRefused) === 404) {
        show({ state: 'REFUSED', headline: 'NOT FOUND', line: 'That reference is not recognised.', note: null }, code, null, 0)
        return
      }
      showRefusal(passRefused, code)
    }
  }
}

// A route that carries its own door wording is trusted with it; anything else is refused with
// the message it gave, which is still a named reason rather than a shrug (criterion 7).
function showRefusal(refused: unknown, code: string): void {
  const carried = (refused as { data?: { data?: RefusalData } }).data?.data
  if (carried?.verdict) {
    show(carried.verdict, carried.reference ?? code, carried.holderName ?? null, carried.partySize ?? 0)
    return
  }
  show({ state: 'REFUSED', headline: 'REFUSED', line: refusalText(refused), note: null }, code, null, 0)
}

// The typed field takes the same four forms the camera does: a hardware scanner acting as a
// keyboard types the whole URL out of a QR, not the reference inside it (criterion 2).
async function scanTyped(): Promise<void> {
  if (!reference.value.trim() || !performanceId.value) return
  const typed = reference.value.trim()
  reference.value = ''
  await admitScanned(typed)
}

function scanNext(): void {
  shown.value = null
  mode.value = cameraNote.value ? 'TYPING' : 'CAMERA'
}

function typeInstead(): void {
  shown.value = null
  mode.value = 'TYPING'
}

const cardClass: Record<DoorVerdict['state'], string> = {
  PAID: 'border-success bg-success/10 text-success',
  UNPAID: 'border-gold-400 bg-gold-400/10 text-gold-400',
  REFUSED: 'border-error bg-error/10 text-error',
}

const cardIcon: Record<DoorVerdict['state'], string> = {
  PAID: 'i-lucide-circle-check',
  UNPAID: 'i-lucide-circle-alert',
  REFUSED: 'i-lucide-circle-x',
}
</script>

<template>
  <NightScreen
    title="Door"
    :hint="shown ? undefined : 'Point the camera at the code, or type the reference.'"
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

    <!-- The verdict takes the whole screen: at a door in the dark it is read at arm's length,
         and nothing else on it is worth a glance (show-night design 2.1). -->
    <div
      v-else-if="shown"
      class="flex flex-col gap-4"
      data-test="door-verdict"
    >
      <div
        class="flex min-h-[45vh] flex-col items-center justify-center gap-3 rounded-2xl border-2 p-6 text-center"
        :class="cardClass[shown.verdict.state]"
        :data-test="`door-verdict-${shown.verdict.state.toLowerCase()}`"
      >
        <UIcon
          :name="cardIcon[shown.verdict.state]"
          class="size-16"
        />
        <p
          v-if="shown.reference"
          class="font-mono text-lg tracking-widest text-muted"
          data-test="door-verdict-reference"
        >
          {{ shown.reference }}
        </p>
        <p class="nnt-headline text-5xl font-bold">
          {{ shown.verdict.headline }}
        </p>
        <p class="text-xl font-semibold text-default">
          {{ shown.verdict.line }}
        </p>
        <UBadge
          v-if="shown.party"
          color="neutral"
          variant="subtle"
          size="lg"
          data-test="door-verdict-party"
        >
          {{ shown.party }}
        </UBadge>
        <p
          v-if="shown.verdict.note"
          class="text-sm text-muted"
        >
          {{ shown.verdict.note }}
        </p>
      </div>

      <p class="text-center text-xs text-muted">
        Door mode: no prices, no emails, no history. Admit or redirect.
      </p>
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

      <QrScanner
        v-if="mode === 'CAMERA'"
        @decoded="admitScanned"
        @unavailable="fallBackToTyping"
      />

      <template v-else>
        <UAlert
          v-if="cameraNote"
          color="neutral"
          variant="subtle"
          icon="i-lucide-camera-off"
          :description="cameraNote"
          data-test="door-camera-note"
        />

        <UFormField label="Ticket or pass reference">
          <UInput
            v-model="reference"
            class="w-full"
            size="xl"
            autofocus
            placeholder="e.g. K7M4PQ"
            data-test="door-reference"
            @keyup.enter="scanTyped"
          />
        </UFormField>
      </template>

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

      <p class="text-center text-xs text-muted">
        Door mode: no prices, no emails, no history. Admit or redirect.
      </p>
    </div>

    <template #actions>
      <template v-if="authorised && shown">
        <!-- Quiet on purpose: the card is the signal, and these two are the ways on from it. -->
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-scan-line"
          size="xl"
          class="min-h-12 w-full justify-center text-lg font-semibold"
          data-test="door-scan-next"
          @click="scanNext"
        >
          Scan next
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-keyboard"
          size="lg"
          class="min-h-12 w-full justify-center"
          data-test="door-type-a-ref"
          @click="typeInstead"
        >
          Type a ref
        </UButton>
      </template>

      <NightAction
        v-else-if="authorised && mode === 'TYPING'"
        label="Scan"
        icon="i-lucide-scan-line"
        :loading="scanning"
        :disabled="!reference.trim() || !performanceId"
        data-test="door-scan"
        @press="scanTyped"
      />
    </template>
  </NightScreen>
</template>
