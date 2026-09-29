<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { saysCategory, saysSeverity } from '#shared/utils/incidents'
import { saysDoorCover, saysOfficerBypass } from '#shared/utils/night-authority'
import { OFFICER_SIGN_OFF_NOTICE, holdsTheClose, openAtClose, saysSignOffOpens, saysSignedOff, tenderTotalPence } from '#shared/utils/night-signoff'
import { saysShiftRole } from '#shared/utils/rota'
import { newestRequest } from '#shared/utils/night-cache'
import { saysTeamHolder } from '#shared/utils/tonight'
import { saysClock, saysDay } from '#shared/utils/when'
import type { ChecklistEntry } from '#shared/utils/checklist'
import type { LateAddition } from '#shared/utils/sumup'
import type { Category, Severity } from '#shared/utils/incidents'
import type { NightAuthorityVia, OfficerBypassLine } from '#shared/utils/night-authority'
import type { NightReportSigner } from '#shared/utils/night-signoff'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'

definePageMeta({ layout: 'tonight', docs: '/docs/tonight/night-report' })
useSeoMeta({ title: 'Night report' })

interface Takings { tenders: { tender: string, totalPence: number }[], compsPence: number, discountsPence: number }
interface Report {
  performanceId: string
  attendance: { sold: number, admitted: number, noShows: number, walkUps: number }
  takings: { desk: Takings, bar: Takings }
  incidents: { id: string, category: Category, severity: Severity, body: string, happenedAt: number, supersededBy: string | null, followUpRequired: boolean }[]
  ageChecks: { accepted: number, refused: number }
  milestones: { id: string, label: string, composedAt: number, supersededBy: string | null }[]
  staffing: { shiftId: string, role: ShiftRole, slot: number, status: ShiftStatus, name: string | null, officerBypass?: boolean }[]
  bypasses?: OfficerBypassLine[]
  covers?: { name: string | null }[]
  // Absent from a report frozen before the bar was read per performance.
  bar: { revenuePence: number, itemsSold: number, nightCardSalesPence?: number }
  // Absent from a report frozen before late additions were read.
  lateAdditions?: LateAddition[]
  access: { verified: number }
  checklist: Pick<ChecklistEntry, 'id' | 'phase' | 'label' | 'required' | 'systemCheck' | 'done' | 'tickedByName' | 'exempted' | 'exemptReason'>[]
  // A draft's alone: when Sign off and close is offered (issue 1315).
  curtainDownAt?: number | null
  signedOff: { closingNote: string, signedByName: string | null, signedVia: NightReportSigner, signedAt: number } | null
  addenda: { id: string, note: string, addedByName: string, addedAt: number }[]
}

const route = useRoute()
const request = useRequestFetch()
const toast = useToast()

const syncedAt = ref<number | null>(null)
const busy = ref(false)
const failure = ref<string | null>(null)
const refusal = ref<string | null>(null)
const report = ref<Report | null>(null)
const performanceId = ref<string | null>(typeof route.query.performanceId === 'string' ? route.query.performanceId : null)
const ambiguous = ref(false)
const { now, stamp } = useNightClock()

// Asked for the duty manager's own role: the layout's badge prefers any shift, and a door shift
// held alongside the officer role would hide that this sign-off is a stand-in (0044).
const via = ref<NightAuthorityVia | null>(null)
const choices = ref<{ performanceId: string, showTitle: string, startsAt: number }[]>([])

const asking = newestRequest()

// Scoped to the performance on screen, because a shift on the other house must not hide that
// this one is signed as a stand-in; only the unscoped answer, the shell's own, lists the houses.
function readAuthority(asked: string | null): Promise<SettledRead<NightAuthorityAnswer>> {
  return askNightAuthority('DUTY_MANAGER', asked ?? undefined)
}

function applyAuthority(asked: string | null, answered: SettledRead<NightAuthorityAnswer>): void {
  if (answered.kind === 'FAILED') {
    via.value = null
    return
  }
  via.value = answered.value.via
  if (!asked) choices.value = answered.value.performances.map(one => ({ performanceId: one.id, showTitle: one.showTitle, startsAt: one.startsAt }))
}

async function loadAuthority(): Promise<void> {
  const mine = asking()
  const asked = performanceId.value
  const answered = await readAuthority(asked)
  if (mine.newest()) applyAuthority(asked, answered)
}

function readDraft(asked: string | null): Promise<SettledRead<Report>> {
  return settleRead(() => request<Report>('/api/tonight/report', { query: asked ? { performanceId: asked } : {} }))
}

function applyDraft(asked: string | null, answered: SettledRead<Report>): void {
  stamp(answered.at)
  if (answered.kind === 'FAILED') {
    ambiguous.value = !asked && answered.status === 400
    failure.value = answered.failure
    // Refused outright: one card, and no sign-off left to press (issue 1304).
    refusal.value = refusalOf(answered)
    return
  }
  report.value = answered.value
  performanceId.value = answered.value.performanceId
  ambiguous.value = false
  failure.value = null
  refusal.value = null
  syncedAt.value = answered.at
}

// The refusal card stays through a re-read, as before, so a refused viewer is never shown the work.
async function load(): Promise<void> {
  busy.value = true
  failure.value = null
  ambiguous.value = false
  try {
    const asked = performanceId.value
    applyDraft(asked, await readDraft(asked))
  }
  finally {
    busy.value = false
  }
}

// In the served page, so the draft, the houses to choose between or the refusal is what a phone
// paints first; a switch between houses reads again on the phone.
const waiting = useServedRead(`tonight-report-${performanceId.value ?? 'tonight'}`, async () => {
  const asked = performanceId.value
  const [authority, draft] = await Promise.all([readAuthority(asked), readDraft(asked)])
  return { asked, authority, draft }
}, (served) => {
  applyAuthority(served.asked, served.authority)
  applyDraft(served.asked, served.draft)
})
const settling = computed(() => busy.value || waiting.value)

function choose(chosen: string): void {
  performanceId.value = chosen
  loadAuthority()
  load()
}

const signedOff = computed(() => report.value?.signedOff ?? null)
const incidents = computed(() => (report.value?.incidents ?? []).filter(one => one.supersededBy === null))
const milestones = computed(() => (report.value?.milestones ?? []).filter(one => one.supersededBy === null))
const exceptions = computed(() => (report.value?.checklist ?? []).filter(one => one.exempted))

const figures = computed(() => {
  const read = report.value
  if (!read) return []
  const { desk, bar } = read.takings
  return [
    { title: 'Attendance', rows: [
      { label: 'Sold', value: String(read.attendance.sold) },
      { label: 'In', value: String(read.attendance.admitted) },
      { label: 'No-shows', value: String(read.attendance.noShows) },
      { label: 'Walk-ups', value: String(read.attendance.walkUps) },
    ] },
    { title: 'Takings', rows: [
      { label: 'Box office', value: saysMoney(tenderTotalPence(desk.tenders)) },
      { label: 'Bar', value: saysMoney(tenderTotalPence(bar.tenders)) },
      { label: 'Comps given', value: saysMoney(desk.compsPence + bar.compsPence) },
      { label: 'Discounts given', value: saysMoney(desk.discountsPence + bar.discountsPence) },
      { label: 'Bar items sold', value: String(read.bar.itemsSold) },
      // The reader serves the whole night, so its figure is labelled as the night's, not this show's.
      ...(read.bar.nightCardSalesPence === undefined ? [] : [{ label: 'Drinks on card, whole night', value: saysMoney(read.bar.nightCardSalesPence) }]),
    ] },
  ]
})

// Read every half minute once mounted, so Sign off and close arrives when the curtain comes down on a
// screen already open. A draft that names no curtain is never held back by one (0078).
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => stamp(Date.now()), 30_000)
})
onUnmounted(() => {
  if (clock) clearInterval(clock)
})

const curtainDownAt = computed(() => report.value?.curtainDownAt ?? null)
const curtainDown = computed(() => curtainDownAt.value === null || now.value >= curtainDownAt.value * 1000)
// After the curtain the post-show items sit here with Tick in place, and the incidents are the
// sign-off's own to review (issue 1315, E-114 criterion 3).
const openItems = computed(() => openAtClose(report.value?.checklist ?? []))
const holding = computed(() => (report.value?.checklist ?? []).filter(holdsTheClose))

const closingNote = ref('')
const signing = ref(false)
const signFailure = ref<string | null>(null)

// Every outcome rereads the report: a 409 that lost the race is answered by the frozen report
// arriving, and one that did not names what moved, which the reread list then shows.
async function signOff(): Promise<void> {
  signing.value = true
  signFailure.value = null
  try {
    const answered = await $fetch<{ ok: true, notice?: string }>('/api/tonight/report/sign-off', {
      method: 'POST',
      body: {
        performanceId: performanceId.value ?? undefined,
        closingNote: closingNote.value,
        incidentsSeen: report.value?.incidents.length ?? 0,
      },
    })
    toast.add({ title: answered.notice ?? 'Night signed off and closed', icon: 'i-lucide-check', color: 'success' })
  }
  catch (refused) {
    signFailure.value = writeFailureText(refused, 'Reload to see whether the report is signed off.')
  }
  finally {
    await load()
    if (signedOff.value) signFailure.value = null
    signing.value = false
  }
}
</script>

<template>
  <NightScreen
    title="Night report"
    :refused="refusal"
    hint="The report fills itself in. After the curtain, answer what is left, add a closing note, and sign off and close."
    :stale="syncedAt"
    :busy="settling"
  >
    <div
      v-if="ambiguous && choices.length > 0"
      class="space-y-3"
      data-test="report-performance-switcher"
    >
      <p class="text-sm text-muted">
        More than one performance is running tonight. Choose the one you are signing off.
      </p>
      <NightPerformanceSwitcher
        :performances="choices"
        :selected-id="performanceId"
        @choose="choose"
      />
    </div>

    <UAlert
      v-else-if="failure"
      data-test="report-failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <div
      v-else-if="report"
      class="space-y-4"
      :data-test="signedOff ? 'report-frozen' : 'report-draft'"
    >
      <UAlert
        v-if="signedOff"
        data-test="report-signed"
        color="success"
        variant="subtle"
        :title="saysSignedOff(signedOff.signedByName, signedOff.signedVia)"
        :description="signedOff.closingNote"
      />

      <p
        v-if="!signedOff && !curtainDown && curtainDownAt !== null"
        class="text-sm text-muted"
        data-test="sign-off-opens"
      >
        {{ saysSignOffOpens(curtainDownAt) }}
      </p>

      <div
        v-if="!signedOff && curtainDown && openItems.length > 0"
        data-test="report-open-items"
      >
        <NightBlock title="Still to do">
          <NightChecklistItems
            :items="openItems"
            :performance-id="performanceId"
            @changed="load"
          />
        </NightBlock>
      </div>

      <NightBlock
        v-for="block in figures"
        :key="block.title"
        :title="block.title"
      >
        <dl class="grid grid-cols-2 gap-2 text-sm">
          <template
            v-for="row in block.rows"
            :key="row.label"
          >
            <dt>{{ row.label }}</dt>
            <dd class="text-right">
              {{ row.value }}
            </dd>
          </template>
        </dl>
      </NightBlock>

      <NightBlock title="Incidents">
        <p
          v-if="incidents.length === 0"
          class="text-sm text-muted"
        >
          None logged.
        </p>
        <p
          v-else-if="!signedOff"
          class="mb-2 text-xs text-muted"
        >
          Sign off and close marks each one reviewed.
        </p>
        <ul class="space-y-2">
          <li
            v-for="incident in incidents"
            :key="incident.id"
            class="text-sm"
          >
            <p class="font-medium">
              {{ saysClock(incident.happenedAt) }} · {{ saysCategory(incident.category) }}, {{ saysSeverity(incident.severity) }}
              <span
                v-if="incident.followUpRequired"
                class="text-xs text-warning"
              >(follow-up)</span>
            </p>
            <p class="text-muted">
              {{ incident.body }}
            </p>
          </li>
        </ul>
      </NightBlock>

      <NightBlock title="Challenge 25">
        <p class="text-sm">
          {{ plural(report.ageChecks.accepted, 'check') }} accepted, {{ plural(report.ageChecks.refused, 'check') }} refused.
        </p>
      </NightBlock>

      <NightBlock title="Staffing">
        <!-- Each role an officer acted in, for the night and never beside a slot: the audit entry
             names no shift (0098). -->
        <ul
          v-if="report.bypasses && report.bypasses.length > 0"
          class="mb-2 space-y-1"
          data-test="staffing-officer-bypass"
        >
          <li
            v-for="(bypass, index) in report.bypasses"
            :key="`${bypass.role}-${index}`"
          >
            <UBadge
              color="warning"
              variant="subtle"
              size="sm"
              class="text-left whitespace-normal"
            >
              {{ saysOfficerBypass(bypass) }}
            </UBadge>
          </li>
        </ul>
        <!-- A report frozen before 0098 carries only the duty manager's flag. -->
        <UBadge
          v-else-if="!report.bypasses && report.staffing.some(row => row.officerBypass)"
          color="warning"
          variant="subtle"
          size="sm"
          class="mb-2"
        >
          An officer opened the duty manager's screens without the shift
        </UBadge>
        <!-- Cover is a shift being worked, not an officer standing in, so it reads plainly (0095). -->
        <ul
          v-if="report.covers && report.covers.length > 0"
          class="mb-2 space-y-1 text-sm text-muted"
          data-test="staffing-door-cover"
        >
          <li
            v-for="(cover, index) in report.covers"
            :key="`cover-${index}`"
          >
            {{ saysDoorCover(cover.name) }}
          </li>
        </ul>
        <ul class="space-y-1 text-sm">
          <li
            v-for="row in report.staffing"
            :key="row.shiftId"
            class="flex justify-between gap-2"
          >
            <span>{{ saysShiftRole(row.role) }}</span>
            <span :class="row.status === 'CONFIRMED' ? '' : 'text-muted'">
              {{ saysTeamHolder({ filled: row.status === 'CONFIRMED', claimed: row.status === 'CLAIMED', name: row.name }) }}
            </span>
          </li>
        </ul>
      </NightBlock>

      <NightBlock
        v-if="milestones.length > 0"
        title="Backstage"
      >
        <ul class="space-y-1 text-sm">
          <li
            v-for="milestone in milestones"
            :key="milestone.id"
          >
            {{ saysClock(milestone.composedAt) }} · {{ milestone.label }}
          </li>
        </ul>
      </NightBlock>

      <NightBlock
        v-if="exceptions.length > 0"
        title="Checklist exceptions"
      >
        <ul class="space-y-1 text-sm">
          <li
            v-for="entry in exceptions"
            :key="entry.id"
          >
            {{ entry.label }}: {{ entry.exemptReason }}
          </li>
        </ul>
      </NightBlock>

      <NightBlock title="Access">
        <p class="text-sm">
          {{ plural(report.access.verified, 'verified access booking') }}.
        </p>
      </NightBlock>

      <!-- Card sales the Treasurer recorded after the till closed (question 15); once signed off,
           one arriving later is an addendum instead. -->
      <NightBlock
        v-if="report.lateAdditions?.length"
        title="Late additions"
        data-test="report-late-additions"
      >
        <ul class="space-y-2 text-sm">
          <li
            v-for="late in report.lateAdditions"
            :key="late.entryId"
          >
            <p>A card sale of {{ saysMoney(late.totalPence) }} the reader took at {{ saysClock(late.chargedAt) }}<span v-if="late.venueName"> ({{ late.venueName }})</span>.</p>
            <p class="text-xs text-muted">
              Recorded by {{ late.recordedByName ?? 'someone since removed' }} on {{ saysDay(late.recordedAt) }} at {{ saysClock(late.recordedAt) }}
            </p>
          </li>
        </ul>
      </NightBlock>

      <NightBlock
        v-if="report.addenda.length > 0"
        title="Addenda"
      >
        <ul class="space-y-2 text-sm">
          <li
            v-for="addendum in report.addenda"
            :key="addendum.id"
          >
            <p>{{ addendum.note }}</p>
            <p class="text-xs text-muted">
              {{ addendum.addedByName }}
            </p>
          </li>
        </ul>
      </NightBlock>

      <form
        v-if="!signedOff && curtainDown"
        class="space-y-3"
        data-test="sign-off-form"
        @submit.prevent="signOff"
      >
        <UAlert
          v-if="via === 'OFFICER'"
          data-test="officer-sign-off"
          color="warning"
          variant="subtle"
          :description="OFFICER_SIGN_OFF_NOTICE"
        />
        <UFormField label="Closing note">
          <UTextarea
            v-model="closingNote"
            :rows="4"
            class="w-full"
            placeholder="How the night went"
            data-test="closing-note"
          />
        </UFormField>
        <UAlert
          v-if="signFailure"
          data-test="sign-off-failure"
          color="error"
          variant="subtle"
          :description="signFailure"
        />
      </form>
    </div>

    <!-- Nothing that ends the night is pinned before the curtain (issue 1315). -->
    <template
      v-if="report && !signedOff && curtainDown"
      #actions
    >
      <NightAction
        label="Sign off and close"
        icon="i-lucide-signature"
        :disabled="closingNote.trim().length === 0 || holding.length > 0"
        :loading="signing"
        data-test="sign-off"
        @press="signOff"
      />
    </template>
  </NightScreen>
</template>
