<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { saysCategory, saysSeverity } from '#shared/utils/incidents'
import { OFFICER_SIGN_OFF_NOTICE, saysSignedOff, tenderTotalPence } from '#shared/utils/night-signoff'
import { saysShiftRole } from '#shared/utils/rota'
import { saysClock } from '#shared/utils/when'
import type { Category, Severity } from '#shared/utils/incidents'
import type { NightReportSigner } from '#shared/utils/night-signoff'
import type { ShiftRole } from '#shared/utils/rota'

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
  staffing: { shiftId: string, role: ShiftRole, slot: number, name: string | null, officerBypass: boolean }[]
  bar: { revenuePence: number, itemsSold: number }
  access: { verified: number }
  checklist: { id: string, label: string, exempted: boolean, exemptReason: string | null }[]
  signedOff: { closingNote: string, signedByName: string | null, signedVia: NightReportSigner, signedAt: number } | null
  addenda: { id: string, note: string, addedByName: string, addedAt: number }[]
}
interface Choice { id: string, showTitle: string, startsAt: number }

const route = useRoute()
const request = useRequestFetch()
const toast = useToast()

const syncedAt = ref<Date | null>(null)
const busy = ref(true)
const failure = ref<string | null>(null)
const report = ref<Report | null>(null)
const performanceId = ref<string | null>(typeof route.query.performanceId === 'string' ? route.query.performanceId : null)
const ambiguous = ref(false)

// Asked for the duty manager's own role: the layout's badge prefers any shift, and a door shift
// held alongside the officer role would hide that this sign-off is a stand-in (0044).
const via = ref<'SHIFT' | 'OFFICER' | null>(null)
const choices = ref<{ performanceId: string, showTitle: string, startsAt: number }[]>([])

let asking = 0

// Scoped to the performance on screen, because a shift on the other house must not hide that
// this one is signed as a stand-in; only the unscoped answer lists the houses to choose from.
async function loadAuthority(): Promise<void> {
  const mine = ++asking
  const asked = performanceId.value
  try {
    const query = asked ? { role: 'DUTY_MANAGER', performanceId: asked } : { role: 'DUTY_MANAGER' }
    const answered = await request<{ via: 'SHIFT' | 'OFFICER', performances: Choice[] }>('/api/tonight/authority', { query })
    if (mine !== asking) return
    via.value = answered.via
    if (!asked) choices.value = answered.performances.map(one => ({ performanceId: one.id, showTitle: one.showTitle, startsAt: one.startsAt }))
  }
  catch {
    if (mine === asking) via.value = null
  }
}

async function load(): Promise<void> {
  busy.value = true
  failure.value = null
  try {
    const read = await request<Report>('/api/tonight/report', { query: performanceId.value ? { performanceId: performanceId.value } : {} })
    report.value = read
    performanceId.value = read.performanceId
    ambiguous.value = false
    syncedAt.value = new Date()
  }
  catch (refused) {
    ambiguous.value = !performanceId.value && refusalStatus(refused) === 400
    failure.value = refusalText(refused)
  }
  finally {
    busy.value = false
  }
}

function choose(chosen: string): void {
  performanceId.value = chosen
  loadAuthority()
  load()
}

onMounted(() => {
  loadAuthority()
  load()
})

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
    ] },
  ]
})

const closingNote = ref('')
const signing = ref(false)
const signFailure = ref<string | null>(null)
const checklistOpen = ref(false)

// Every outcome rereads the report: a 409 that lost the race is answered by the frozen report
// arriving, and one that did not is the checklist gate, which the screen then points at.
async function signOff(): Promise<void> {
  signing.value = true
  signFailure.value = null
  checklistOpen.value = false
  try {
    const answered = await $fetch<{ ok: true, notice?: string }>('/api/tonight/report/sign-off', {
      method: 'POST',
      body: { performanceId: performanceId.value ?? undefined, closingNote: closingNote.value },
    })
    toast.add({ title: answered.notice ?? 'Night report signed off', icon: 'i-lucide-check', color: 'success' })
  }
  catch (refused) {
    signFailure.value = writeFailureText(refused, 'Reload to see whether the report is signed off.')
    checklistOpen.value = refusalStatus(refused) === 409
  }
  finally {
    await load()
    if (signedOff.value) {
      signFailure.value = null
      checklistOpen.value = false
    }
    signing.value = false
  }
}

const checklistLink = computed(() => performanceId.value ? `/tonight/checklist?performanceId=${performanceId.value}` : '/tonight/checklist')
</script>

<template>
  <NightScreen
    title="Night report"
    hint="The report fills itself in. Read it through, add a closing note and sign it off."
    :stale="syncedAt"
    :busy="busy"
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
        <!-- The flag is the night's, not any slot's: the audit entry names no shift (0044). -->
        <UBadge
          v-if="report.staffing.some(row => row.officerBypass)"
          color="warning"
          variant="subtle"
          size="sm"
          class="mb-2"
          data-test="staffing-officer-bypass"
        >
          An officer opened the duty manager's screens without the shift
        </UBadge>
        <ul class="space-y-1 text-sm">
          <li
            v-for="row in report.staffing"
            :key="row.shiftId"
            class="flex justify-between gap-2"
          >
            <span>{{ saysShiftRole(row.role) }}</span>
            <span :class="row.name ? '' : 'text-muted'">
              {{ row.name ?? 'Unfilled' }}
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
        v-if="!signedOff"
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
        >
          <template
            v-if="checklistOpen"
            #actions
          >
            <UButton
              :to="checklistLink"
              color="neutral"
              variant="subtle"
              data-test="open-checklist"
            >
              Open the checklist
            </UButton>
          </template>
        </UAlert>
      </form>
    </div>

    <template
      v-if="report && !signedOff"
      #actions
    >
      <NightAction
        label="Sign off"
        icon="i-lucide-signature"
        :disabled="closingNote.trim().length === 0"
        :loading="signing"
        data-test="sign-off"
        @press="signOff"
      />
    </template>
  </NightScreen>
</template>
