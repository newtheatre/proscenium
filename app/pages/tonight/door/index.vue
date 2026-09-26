<script setup lang="ts">
import { CAMERA_FALLBACK_SAYS, doorFailureVerdict, doorMissVerdict, doorNameTerm, lookUpOutcome, readScannedCode, saysDoorParty, verdictBuzz, verdictHoldMs } from '#shared/utils/door'
import { doorStripLine, doorStripNumbers } from '#shared/utils/night-hub'
import { saysPerformanceChoice } from '#shared/utils/tonight'
import type { HubHouse } from '#shared/utils/night-hub'
import type { DoorAdmission, DoorPassCard, DoorTicketFound, DoorVerdict, LookUpHalf, ScannerFailure } from '#shared/utils/door'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight/door' })
useSeoMeta({ title: 'Door' })

interface CoveredPerformance { id: string, showTitle: string, startsAt: number, venueName: string, active: boolean }
interface Authority { performanceIds: string[], performances: CoveredPerformance[] }
interface RefusalData { verdict?: DoorVerdict, reference?: string, holderName?: string | null, partySize?: number, accessWording?: string | null }
interface HouseView { performanceId: string, house: HubHouse, latecomerPolicy: string | null, intervalCount: number, intervalMinutes: number | null }

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

// One screen: the camera stays open, and the one field under it takes a QR's text, a reference
// or a name (issue 1301). A device with no camera keeps the field alone (E-129 criterion 5).
const cameraNote = ref<string | null>(null)
const field = ref('')
const scanning = ref(false)

interface Found { tickets: DoorTicketFound[], passes: DoorPassCard[], unchecked: LookUpHalf | null }
const found = ref<Found | null>(null)

interface Shown { verdict: DoorVerdict, reference: string, party: string | null, access: string | null }
const shown = ref<Shown | null>(null)
let holdTimer: ReturnType<typeof setTimeout> | undefined

const fieldInput = useTemplateRef<{ inputRef: HTMLInputElement | null }>('fieldInput')
const answerArea = useTemplateRef<HTMLElement>('answerArea')
const resultsArea = useTemplateRef<HTMLElement>('resultsArea')

// With no camera the field is the whole door, so it takes the cursor, ready for a scanner that
// types (E-129 criterion 5).
function fallBackToTyping(failure: ScannerFailure): void {
  cameraNote.value = CAMERA_FALLBACK_SAYS[failure]
  nextTick(() => fieldInput.value?.inputRef?.focus())
}

// A verdict or a list can land off screen on a phone once somebody has scrolled to a result.
function bringIntoView(area: HTMLElement | null): void {
  nextTick(() => area?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}

// Over the camera the card clears itself so the queue keeps moving, holding longer for a reason
// that has to be read out; with no camera it stays until the next check (issue 1150 item 1).
function show(verdict: DoorVerdict, reference: string, holderName: string | null, partySize: number, access: string | null = null): void {
  clearVerdict()
  found.value = null
  shown.value = { verdict, reference, party: partySize > 0 ? saysDoorParty(holderName, partySize) : null, access }
  buzz(verdict)
  bringIntoView(answerArea.value)
  if (!cameraNote.value) holdTimer = setTimeout(clearVerdict, verdictHoldMs(verdict.state))
}

function clearVerdict(): void {
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = undefined
  shown.value = null
}

onBeforeUnmount(clearVerdict)
watch(performanceId, () => {
  found.value = null
  clearVerdict()
})

// A pattern per verdict, for a volunteer whose eyes are on the patron. Older browsers and iOS
// have no `vibrate` at all, so nothing here may assume one.
function buzz(verdict: DoorVerdict): void {
  const pattern = verdictBuzz(verdict.state)
  if (pattern.length > 0 && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern)
  }
}

// One question to the door's routes at a time, whether it came from the camera, the field or a
// result's Admit, so a double tap or a second decode never races the first.
async function oneAtATime(work: () => Promise<void>): Promise<void> {
  if (scanning.value || !performanceId.value) return
  scanning.value = true
  try {
    await work()
  }
  finally {
    scanning.value = false
  }
}

// A signed booking or pass URL, or the `/t/<ref>` form, checked server-side (criterion 2).
function checkCode(scanned: string): Promise<void> {
  return oneAtATime(async () => {
    found.value = null
    try {
      const resolved = await $fetch<{ kind: string, reference: string }>('/api/tonight/door/resolve', {
        method: 'POST',
        body: { scanned, performanceId: performanceId.value },
      })
      // A pass QR lists the holder's own card rather than admitting blind: the volunteer reads
      // what it covers and what tonight already holds before pressing Admit (D-126 criterion 1).
      if (resolved.kind === 'PASS_TOKEN') await lookUp(resolved.reference, { passesOnly: true })
      else await admit(resolved.reference)
    }
    catch (refused) {
      showRefusal(refused, '')
    }
  })
}

async function scanPass(reference: string, holderName: string | null): Promise<void> {
  const pass = await $fetch<DoorAdmission>('/api/tonight/door/passes/scan', {
    method: 'POST',
    body: { reference, performanceId: performanceId.value },
  })
  show(pass.verdict, pass.reference, holderName ?? pass.holderName, pass.partySize)
  loadHouse()
}

// `name` is what a typed entry is looked up as when no booking or pass carries it as a reference.
async function admit(code: string, name: string | null = null): Promise<void> {
  try {
    const ticket = await $fetch<DoorAdmission>('/api/tonight/door/tickets/scan', {
      method: 'POST',
      body: { reference: code, performanceId: performanceId.value },
    })
    show(ticket.verdict, ticket.reference, ticket.holderName, ticket.partySize, ticket.accessWording ?? null)
    loadHouse()
  }
  catch (ticketRefused) {
    // Only "no such booking" tries the reference as a pass instead; any other refusal (wrong
    // performance, unpaid, already admitted) is the answer, whichever kind of reference it was.
    if (refusalStatus(ticketRefused) !== 404) {
      showRefusal(ticketRefused, code)
      return
    }
    try {
      await scanPass(code, null)
    }
    catch (passRefused) {
      if (refusalStatus(passRefused) !== 404) showRefusal(passRefused, code)
      else if (name) await lookUp(name)
      else show(doorMissVerdict(), code, null, 0)
    }
  }
}

// Tickets and passes are asked together. Nothing found is amber, but a lookup that failed is
// never read as nothing found: its own refusal or no answer is shown (issue 1145, issue 1301).
async function lookUp(term: string, options: { passesOnly?: boolean } = {}): Promise<void> {
  const asked = performanceId.value
  const query = { q: term, performanceId: asked }
  const [tickets, passes] = await Promise.allSettled([
    options.passesOnly ? Promise.resolve({ items: [] as DoorTicketFound[] }) : $fetch<{ items: DoorTicketFound[] }>('/api/tonight/door/tickets/search', { query }),
    $fetch<{ items: DoorPassCard[] }>('/api/tonight/door/passes/search', { query }),
  ])
  // The picker moved while the lookup was out: its answer is about a house nobody is looking at.
  if (performanceId.value !== asked) return
  const outcome = lookUpOutcome(tickets, passes)
  if (outcome.kind === 'FAILED') showRefusal(outcome.reason, '')
  else if (outcome.kind === 'MISS') show(doorMissVerdict(), '', null, 0)
  else {
    clearVerdict()
    found.value = { tickets: outcome.tickets, passes: outcome.passes, unchecked: outcome.unchecked }
    bringIntoView(resultsArea.value)
  }
}
// A route that carries its own door wording is trusted with it; anything else is refused with
// the message it gave (criterion 7), unless no answer came at all, which is not a refusal.
function showRefusal(refused: unknown, code: string): void {
  const carried = (refused as { data?: { data?: RefusalData } }).data?.data
  if (carried?.verdict) {
    show(carried.verdict, carried.reference ?? code, carried.holderName ?? null, carried.partySize ?? 0, carried.accessWording ?? null)
    return
  }
  show(doorFailureVerdict(refusalStatus(refused), refusalText(refused)), code, null, 0)
}

// A hardware scanner acting as a keyboard types the whole URL out of a QR, so the field takes
// every form the camera does, and a name besides; a bare reference needs no resolving.
async function checkTyped(): Promise<void> {
  const typed = field.value.trim()
  if (!typed || !performanceId.value) return
  field.value = ''
  const name = doorNameTerm(typed)
  const code = readScannedCode(typed)
  if (code?.kind === 'REFERENCE') await oneAtATime(() => admit(code.value, name))
  else if (code) await checkCode(typed)
  else if (name) await oneAtATime(() => lookUp(name))
  else show(doorMissVerdict(), '', null, 0)
}

function admitFound(reference: string): Promise<void> {
  return oneAtATime(() => admit(reference))
}

// A pass card's Admit, through the same one-at-a-time runner as every other check.
function admitFoundPass(reference: string, holderName: string): Promise<void> {
  return oneAtATime(() => scanPass(reference, holderName).catch(refused => showRefusal(refused, reference)))
}

// The house under the camera for whoever holds the door, not only the duty manager: in, sold, seats
// left, the latecomer rule and the intervals (issue 1307). Best effort, never in the door's way.
const HOUSE_POLL_MS = 20_000
const houses = ref<HouseView[]>([])
const strip = computed(() => houses.value.find(one => one.performanceId === performanceId.value) ?? null)
let houseTimer: ReturnType<typeof setInterval> | undefined

async function loadHouse(): Promise<void> {
  try {
    houses.value = (await $fetch<{ performances: HouseView[] }>('/api/tonight/house')).performances
  }
  catch {
    // The strip is a courtesy: a door that cannot read the house still admits.
  }
}

onMounted(() => {
  loadHouse()
  houseTimer = setInterval(loadHouse, HOUSE_POLL_MS)
})
onBeforeUnmount(() => {
  if (houseTimer) clearInterval(houseTimer)
})
</script>

<template>
  <NightScreen
    title="Door"
    hint="Scan the code, or type the reference or a name. Refused? Send them to the bar."
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

      <!-- The camera stays open behind the verdict and beside the field: a queue of two hundred is
           two hundred taps and two hundred cold starts otherwise (E-129, issue 1150 item 1). -->
      <div
        ref="answerArea"
        class="space-y-4"
      >
        <QrScanner
          v-if="!cameraNote"
          @decoded="checkCode"
          @unavailable="fallBackToTyping"
        >
          <template #overlay>
            <DoorVerdictCard
              v-if="shown"
              overlay
              :verdict="shown.verdict"
              :reference="shown.reference"
              :party="shown.party"
              :access="shown.access"
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
            :access="shown.access"
            @dismiss="clearVerdict"
          />

          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-lucide-camera-off"
            :description="cameraNote"
            data-test="door-camera-note"
          />
        </template>
      </div>

      <div
        v-if="strip"
        class="rounded-xl bg-elevated px-3 py-2 text-center"
        data-test="door-strip"
      >
        <p class="font-mono text-sm font-bold tabular-nums">
          {{ doorStripNumbers(strip.house) }}
        </p>
        <p class="text-xs text-muted">
          {{ doorStripLine(strip.latecomerPolicy, strip.intervalCount, strip.intervalMinutes) }}
        </p>
      </div>

      <UFormField label="QR, reference or name">
        <UInput
          ref="fieldInput"
          v-model="field"
          class="w-full"
          size="xl"
          autocapitalize="words"
          autocorrect="off"
          autocomplete="off"
          inputmode="text"
          :spellcheck="false"
          placeholder="e.g. K7M4PQ or Mira"
          data-test="door-reference"
          @keyup.enter="checkTyped"
        />
      </UFormField>

      <div ref="resultsArea">
        <DoorResults
          v-if="found"
          :tickets="found.tickets"
          :passes="found.passes"
          :unchecked="found.unchecked"
          :busy="scanning"
          @admit-ticket="admitFound"
          @admit-pass="admitFoundPass"
        />
      </div>

      <p class="text-center text-xs text-muted">
        Admit, or send to the bar.
      </p>
    </div>

    <template #actions>
      <NightAction
        v-if="authorised"
        label="Check"
        icon="i-lucide-search"
        :loading="scanning"
        :disabled="!field.trim() || !performanceId"
        data-test="door-scan"
        @press="checkTyped"
      />
    </template>
  </NightScreen>
</template>
