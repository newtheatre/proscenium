<script setup lang="ts">
import { saysMoney } from '#shared/utils/bar'
import { saysCategory, saysSeverity } from '#shared/utils/incidents'
import { saysDoorCover, saysOfficerBypass } from '#shared/utils/night-authority'
import { saysSignedOff, tenderTotalPence } from '#shared/utils/night-signoff'
import { saysShiftRole } from '#shared/utils/rota'
import { saysTeamHolder } from '#shared/utils/tonight'
import { saysClock, saysWhen } from '#shared/utils/when'
import type { Category, Severity } from '#shared/utils/incidents'
import type { OfficerBypassLine } from '#shared/utils/night-authority'
import type { NightReportSigner } from '#shared/utils/night-signoff'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'

definePageMeta({ layout: 'console', title: 'Night report', middleware: 'console', docs: '/docs/reports' })

interface Takings { tenders: { totalPence: number }[], compsPence: number, discountsPence: number }
interface SignedReport {
  showTitle: string | null
  venueName: string | null
  startsAt: number | null
  attendance: { sold: number, admitted: number, noShows: number, walkUps: number, passAdmissions?: number }
  takings: { desk: Takings, bar: Takings }
  incidents: { id: string, category: Category, severity: Severity, body: string, happenedAt: number, supersededBy: string | null, followUpRequired: boolean }[]
  ageChecks: { accepted: number, refused: number }
  staffing: { shiftId: string, role: ShiftRole, status: ShiftStatus, name: string | null }[]
  bypasses?: OfficerBypassLine[]
  covers?: { name: string | null }[]
  checklist: { id: string, label: string, exempted: boolean, exemptReason: string | null }[]
  signedOff: { closingNote: string, signedByName: string | null, signedVia: NightReportSigner, signedAt: number }
  addenda: { id: string, note: string, addedByName: string, addedAt: number }[]
  deliveries: { recipient: string, status: 'SENT' | 'FAILED', sentAt: number | null }[]
}

const route = useRoute()
const request = useRequestFetch()
const toast = useToast()
const viewer = useViewer()
const performanceId = String(route.params.performanceId)

const { data: report, error, refresh } = await useAsyncData(
  `night-report-${performanceId}`,
  () => request<SignedReport>(`/api/admin/night-reports/${encodeURIComponent(performanceId)}`),
)
const failure = useListFailure(error, 'The night report could not be read.')

// A correction is the night's officer's to add, so the form is offered only to them (0239).
const corrects = computed(() => viewer.value?.permissions.includes('night.manage') ?? false)

const incidents = computed(() => (report.value?.incidents ?? []).filter(one => one.supersededBy === null))
const exceptions = computed(() => (report.value?.checklist ?? []).filter(one => one.exempted))

const figures = computed(() => {
  const read = report.value
  if (!read) return []
  const { desk, bar } = read.takings
  return [
    { label: 'Sold', value: String(read.attendance.sold) },
    { label: 'In', value: String(read.attendance.admitted) },
    { label: 'No-shows', value: String(read.attendance.noShows) },
    { label: 'Walk-ups sold', value: String(read.attendance.walkUps) },
    ...(read.attendance.passAdmissions === undefined ? [] : [{ label: 'Pass admissions', value: String(read.attendance.passAdmissions) }]),
    { label: 'Box office', value: saysMoney(tenderTotalPence(desk.tenders)) },
    { label: 'Bar', value: saysMoney(tenderTotalPence(bar.tenders)) },
    { label: 'Comps given', value: saysMoney(desk.compsPence + bar.compsPence) },
    { label: 'Discounts given', value: saysMoney(desk.discountsPence + bar.discountsPence) },
  ]
})

const note = ref('')
const adding = ref(false)
const addFailure = ref<string | null>(null)

async function addCorrection(): Promise<void> {
  adding.value = true
  addFailure.value = null
  try {
    await $fetch('/api/admin/night-reports/addenda', { method: 'POST', body: { performanceId, note: note.value } })
    note.value = ''
    toast.add({ title: 'Correction added and emailed', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (refused) {
    addFailure.value = writeFailureText(refused, 'Reload to see whether the correction was added.')
  }
  finally {
    adding.value = false
  }
}
</script>

<template>
  <div class="max-w-3xl space-y-4">
    <UButton
      to="/reports?tab=performances"
      variant="link"
      icon="i-lucide-arrow-left"
      class="px-0"
    >
      Night reports
    </UButton>

    <ReadGate
      :failure="failure"
      class="space-y-4"
      @retry="refresh"
    >
      <template v-if="report">
        <div>
          <h2
            class="text-lg font-semibold"
            data-test="night-report-title"
          >
            {{ report.showTitle ?? 'A performance' }}
          </h2>
          <p
            v-if="report.startsAt"
            class="text-sm text-muted"
          >
            {{ saysWhen(report.startsAt) }}<span v-if="report.venueName">, {{ report.venueName }}</span>
          </p>
        </div>

        <UCard data-test="night-report-signed">
          <p class="font-medium">
            {{ saysSignedOff(report.signedOff.signedByName, report.signedOff.signedVia) }}
          </p>
          <p class="mt-1 text-sm text-muted whitespace-pre-line">
            {{ report.signedOff.closingNote }}
          </p>
        </UCard>

        <UCard>
          <dl
            class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"
            data-test="night-report-figures"
          >
            <div
              v-for="row in figures"
              :key="row.label"
            >
              <dt class="text-muted">
                {{ row.label }}
              </dt>
              <dd class="font-medium">
                {{ row.value }}
              </dd>
            </div>
          </dl>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="font-medium">
              Incidents
            </h3>
          </template>
          <p
            v-if="incidents.length === 0"
            class="text-sm text-muted"
          >
            None logged.
          </p>
          <ul
            v-else
            class="space-y-2 text-sm"
          >
            <li
              v-for="incident in incidents"
              :key="incident.id"
            >
              <p class="font-medium">
                {{ saysClock(incident.happenedAt) }} · {{ saysCategory(incident.category) }}, {{ saysSeverity(incident.severity) }}
              </p>
              <p class="text-muted">
                {{ incident.body }}
              </p>
            </li>
          </ul>
          <p class="mt-3 text-sm">
            Challenge 25: {{ plural(report.ageChecks.accepted, 'check') }} accepted, {{ plural(report.ageChecks.refused, 'check') }} refused.
          </p>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="font-medium">
              Staffing
            </h3>
          </template>
          <ul
            v-if="report.bypasses?.length || report.covers?.length"
            class="mb-2 space-y-1 text-sm text-muted"
          >
            <li
              v-for="(bypass, index) in report.bypasses ?? []"
              :key="`bypass-${index}`"
            >
              {{ saysOfficerBypass(bypass) }}
            </li>
            <li
              v-for="(cover, index) in report.covers ?? []"
              :key="`cover-${index}`"
            >
              {{ saysDoorCover(cover.name) }}
            </li>
          </ul>
          <p
            v-if="report.staffing.length === 0"
            class="text-sm text-muted"
          >
            No shifts were on the rota for this performance.
          </p>
          <ul
            v-else
            class="space-y-1 text-sm"
          >
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
          <ul
            v-if="exceptions.length > 0"
            class="mt-3 space-y-1 text-sm"
          >
            <li
              v-for="entry in exceptions"
              :key="entry.id"
            >
              Checklist exception, {{ entry.label }}: {{ entry.exemptReason }}
            </li>
          </ul>
        </UCard>

        <UCard data-test="night-report-addenda">
          <template #header>
            <h3 class="font-medium">
              Corrections
            </h3>
          </template>
          <p
            v-if="report.addenda.length === 0"
            class="text-sm text-muted"
          >
            None yet. A signed report never changes; a correction is added beneath it.
          </p>
          <ul
            v-else
            class="space-y-2 text-sm"
          >
            <li
              v-for="addendum in report.addenda"
              :key="addendum.id"
            >
              <p>{{ addendum.note }}</p>
              <p class="text-xs text-muted">
                {{ addendum.addedByName }}, {{ saysWhen(addendum.addedAt) }}
              </p>
            </li>
          </ul>
          <form
            v-if="corrects"
            class="mt-3 space-y-2"
            data-test="night-report-correction"
            @submit.prevent="addCorrection"
          >
            <UFormField label="Add a correction">
              <UTextarea
                v-model="note"
                :rows="3"
                class="w-full"
                data-test="correction-note"
              />
            </UFormField>
            <UAlert
              v-if="addFailure"
              color="error"
              variant="subtle"
              :description="addFailure"
            />
            <UButton
              type="submit"
              :loading="adding"
              :disabled="note.trim().length === 0"
              data-test="correction-add"
            >
              Add and email the correction
            </UButton>
          </form>
        </UCard>

        <UCard data-test="night-report-deliveries">
          <template #header>
            <h3 class="font-medium">
              Emailed to
            </h3>
          </template>
          <p
            v-if="report.deliveries.length === 0"
            class="text-sm text-muted"
          >
            Nobody: no send is recorded for this report.
          </p>
          <ul
            v-else
            class="space-y-1 text-sm"
          >
            <li
              v-for="(delivery, index) in report.deliveries"
              :key="`${delivery.recipient}-${index}`"
              class="flex justify-between gap-2"
            >
              <span class="truncate">{{ delivery.recipient }}</span>
              <span :class="delivery.status === 'SENT' ? 'text-muted' : 'text-error'">
                {{ delivery.status === 'SENT' && delivery.sentAt ? saysWhen(delivery.sentAt) : 'Not delivered' }}
              </span>
            </li>
          </ul>
        </UCard>
      </template>
    </ReadGate>
  </div>
</template>
