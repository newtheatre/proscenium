<script setup lang="ts">
import { CAMERA_FALLBACK_SAYS, doorFailureVerdict, saysDoorParty, verdictBuzz, verdictHoldMs } from '#shared/utils/door'
import { saysPerformanceChoice } from '#shared/utils/tonight'
import type { DoorVerdict, ScannerFailure } from '#shared/utils/door'

definePageMeta({ layout: 'tonight', docs: '/docs/show-night/the-door' })
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

// The camera is the door's default, the typed field its fallback for no camera (E-129 1, 5).
// Pass mode arrives via `?mode=pass` from the hub, or a scanned pass QR (D-126).
type Mode = 'CAMERA' | 'TYPING' | 'PASS'
const route = useRoute()
const mode = ref<Mode>(route.query.mode === 'pass' ? 'PASS' : 'CAMERA')
const passPrefill = ref('')
const cameraNote = ref<string | null>(null)

// The hub links straight to `?mode=pass`, and the route is the same one, so the query is watched
// rather than read once at setup.
watch(() => route.query.mode, (wanted) => {
  if (wanted === 'pass') mode.value = 'PASS'
})

const reference = ref('')
const scanning = ref(false)

interface Shown { verdict: DoorVerdict, reference: string, party: string | null }
const shown = ref<Shown | null>(null)
let holdTimer: ReturnType<typeof setTimeout> | undefined

function fallBackToTyping(failure: ScannerFailure): void {
  cameraNote.value = CAMERA_FALLBACK_SAYS[failure]
  mode.value = 'TYPING'
}

// The card clears itself so the queue keeps moving; a refusal holds longer, because the reason
// is what the volunteer has to read out (issue 1150 item 1).
function show(verdict: DoorVerdict, reference: string, holderName: string | null, partySize: number): void {
  clearVerdict()
  shown.value = { verdict, reference, party: partySize > 0 ? saysDoorParty(holderName, partySize) : null }
  buzz(verdict)
  if (mode.value === 'CAMERA') holdTimer = setTimeout(clearVerdict, verdictHoldMs(verdict.state))
}

function clearVerdict(): void {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = undefined
  shown.value = null
}

onBeforeUnmount(clearVerdict)

// A pattern per verdict, for a volunteer whose eyes are on the patron. Older browsers and iOS
// have no `vibrate` at all, so nothing here may assume one.
function buzz(verdict: DoorVerdict): void {
  const pattern = verdictBuzz(verdict.state)
  if (pattern.length > 0 && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern)
  }
}

// Whatever the lens read: this build's signed booking and pass URLs, the `/t/<ref>` form, or a
// bare reference. The signature is checked server-side, never here (criterion 2).
async function admitScanned(scanned: string): Promise<void> {
  if (scanning.value || !performanceId.value) return
  scanning.value = true
  try {
    const resolved = await $fetch<{ kind: string, reference: string }>('/api/tonight/door/resolve', {
      method: 'POST',
      body: { scanned, performanceId: performanceId.value },
    })
    // A pass QR opens the holder's own card rather than admitting blind: the volunteer reads what
    // it covers and what tonight already holds before pressing Admit (D-126 criterion 1).
    if (resolved.kind === 'PASS_TOKEN') {
      clearVerdict()
      passPrefill.value = resolved.reference
      mode.value = 'PASS'
      return
    }
    await admit(resolved.reference)
  }
  catch (refused) {
    showRefusal(refused, '', 'NOT OURS')
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
// the message it gave (criterion 7), unless no answer came at all, which is not a refusal.
function showRefusal(refused: unknown, code: string, headline = 'REFUSED'): void {
  const carried = (refused as { data?: { data?: RefusalData } }).data?.data
  if (carried?.verdict) {
    show(carried.verdict, carried.reference ?? code, carried.holderName ?? null, carried.partySize ?? 0)
    return
  }
  show(doorFailureVerdict(refusalStatus(refused), refusalText(refused), headline), code, null, 0)
}

// The typed field takes the same four forms the camera does: a hardware scanner acting as a
// keyboard types the whole URL out of a QR, not the reference inside it (criterion 2).
async function checkTyped(): Promise<void> {
  if (!reference.value.trim() || !performanceId.value) return
  const typed = reference.value.trim()
  reference.value = ''
  await admitScanned(typed)
}

function useTheCamera(): void {
  clearVerdict()
  mode.value = 'CAMERA'
}

function typeInstead(): void {
  clearVerdict()
  mode.value = 'TYPING'
}

function showPassAdmission(result: { reference: string, verdict: DoorVerdict, holderName: string | null, partySize: number }): void {
  show(result.verdict, result.reference, result.holderName, result.partySize)
}

const hint = computed(() => {
  if (mode.value === 'PASS') return 'Find the holder, or the reference on the pass. Refused? Send them to the bar.'
  return 'Point the camera at the code, or type the reference.'
})
</script>

<template>
  <NightScreen
    :title="mode === 'PASS' && !shown ? 'Admit pass holder' : 'Door'"
    :hint="hint"
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
        :description="authorityFailure ?? 'Checking your shift…'"
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

      <template v-if="mode === 'PASS'">
        <DoorVerdictCard
          v-if="shown"
          :verdict="shown.verdict"
          :reference="shown.reference"
          :party="shown.party"
          @dismiss="clearVerdict"
        />
        <DoorPassMode
          v-else
          :performance-id="performanceId"
          :prefill="passPrefill"
          @admitted="showPassAdmission"
        />
      </template>

      <!-- The camera stays open behind the verdict: a queue of two hundred is two hundred taps
           and two hundred cold starts otherwise (E-129, issue 1150 item 1). -->
      <QrScanner
        v-else-if="mode === 'CAMERA'"
        @decoded="admitScanned"
        @unavailable="fallBackToTyping"
      >
        <template #overlay>
          <DoorVerdictCard
            v-if="shown"
            overlay
            :verdict="shown.verdict"
            :reference="shown.reference"
            :party="shown.party"
            @dismiss="clearVerdict"
          />
        </template>
      </QrScanner>

      <template v-else>
        <DoorVerdictCard
          v-if="shown"
          :verdict="shown.verdict"
          :reference="shown.reference"
          :party="shown.party"
          @dismiss="clearVerdict"
        />

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
            autocapitalize="characters"
            autocorrect="off"
            autocomplete="off"
            inputmode="text"
            :spellcheck="false"
            placeholder="e.g. K7M4PQ"
            data-test="door-reference"
            @keyup.enter="checkTyped"
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
        Admit, or send to the bar.
      </p>
    </div>

    <template #actions>
      <NightAction
        v-if="authorised && mode === 'TYPING'"
        label="Check"
        icon="i-lucide-search"
        :loading="scanning"
        :disabled="!reference.trim() || !performanceId"
        data-test="door-scan"
        @press="checkTyped"
      />

      <UButton
        v-if="authorised && mode === 'TYPING' && !cameraNote"
        color="neutral"
        variant="ghost"
        icon="i-lucide-scan-line"
        size="lg"
        class="min-h-12 w-full justify-center"
        data-test="door-use-camera"
        @click="useTheCamera"
      >
        Use the camera
      </UButton>

      <UButton
        v-else-if="authorised && mode === 'CAMERA'"
        color="neutral"
        variant="ghost"
        icon="i-lucide-keyboard"
        size="lg"
        class="min-h-12 w-full justify-center"
        data-test="door-type-a-ref"
        @click="typeInstead"
      >
        Type a reference
      </UButton>
    </template>
  </NightScreen>
</template>
