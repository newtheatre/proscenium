<script setup lang="ts">
import { can, grantRoles, viewRota, viewTrainingCatalogue } from '#shared/utils/abilities'
import { saysPersonStaffing, staffingFixes } from '#shared/utils/person-view'
import { saysShiftRole, saysShiftStatus } from '#shared/utils/rota'
import { saysWhen } from '#shared/utils/when'
import type { PersonRoleLine, StaffingFix } from '#shared/utils/person-view'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'

// What one person can staff and why not, with what they are on, for whoever reads the rota (0255).
const props = defineProps<{ userId: string }>()

interface Shift { shiftId: string, role: ShiftRole, status: ShiftStatus, showTitle: string, venueName: string, startsAt: number }
interface Opening { slotId: string, status: ShiftStatus, label: string, venueName: string, startsAt: number }
interface Standing { roles: PersonRoleLine[], shifts: Shift[], openings: Opening[] }

const SHOWN_SHIFTS = 6

const viewer = useViewer()
const request = useRequestFetch()

// Exposed above the await below: defineExpose after one no longer attaches to the instance.
async function reread(): Promise<void> {
  await refresh()
}
defineExpose({ refresh: reread })

const { data, error, refresh } = await useAsyncData(
  `person-rota-${props.userId}`,
  () => request<Standing>(`/api/admin/accounts/${props.userId}/rota`),
  { default: (): Standing => ({ roles: [], shifts: [], openings: [] }) },
)
const failure = useListFailure(error, 'Their rota could not be read.')

// A fix is offered only to a viewer who may open the screen it is made on (0040).
const fixLinks = computed<Partial<Record<StaffingFix, { to: string, label: string }>>>(() => ({
  ...(can(viewer.value, viewTrainingCatalogue) ? { TRAINING: { to: `/training/manage/records?person=${props.userId}`, label: 'Open their training' } } : {}),
  ...(can(viewer.value, grantRoles) ? { ROLES: { to: '#grant-role', label: 'Grant a role' } } : {}),
  ...(can(viewer.value, viewRota) ? { TEMPLATES: { to: '/rota/manage/templates', label: 'Shift templates' } } : {}),
}))
const fixesFor = (line: PersonRoleLine) => staffingFixes(line.staffing).flatMap(fix => fixLinks.value[fix] ?? [])

const work = computed(() => [
  ...data.value.shifts.map(shift => ({ key: shift.shiftId, what: shift.showTitle, role: saysShiftRole(shift.role), status: shift.status, venueName: shift.venueName, startsAt: shift.startsAt })),
  ...data.value.openings.map(slot => ({ key: slot.slotId, what: slot.label, role: 'Bar', status: slot.status, venueName: slot.venueName, startsAt: slot.startsAt })),
].sort((a, b) => a.startsAt - b.startsAt))
</script>

<template>
  <UPageCard
    title="Rota"
    description="What they can be put on now, and what they are already on from tonight."
    data-test="person-rota"
  >
    <ReadFailure
      v-if="failure"
      :failure="failure"
      @retry="refresh"
    />
    <template v-else>
      <ul class="space-y-2 text-sm">
        <li
          v-for="line in data.roles"
          :key="line.role"
          class="flex items-start gap-2"
          :data-test="`person-staffing-${line.role}`"
        >
          <UIcon
            :name="line.staffing === 'CAN_STAFF' ? 'i-lucide-circle-check' : 'i-lucide-lock'"
            :class="line.staffing === 'CAN_STAFF' ? 'mt-0.5 size-4 shrink-0 text-success' : 'mt-0.5 size-4 shrink-0 text-muted'"
          />
          <span>
            <span class="font-medium">{{ saysShiftRole(line.role) }}</span>:
            {{ saysPersonStaffing(line) }}
            <ULink
              v-for="fix in fixesFor(line)"
              :key="fix.to"
              :to="fix.to"
              class="ms-1 text-primary"
              :data-test="`person-fix-${line.role}`"
            >{{ fix.label }}</ULink>
          </span>
        </li>
      </ul>

      <div class="mt-4 border-t border-default pt-3">
        <p
          v-if="work.length === 0"
          class="text-sm text-muted"
          data-test="person-shifts-none"
        >
          On no shift from tonight.
        </p>
        <ul
          v-else
          class="space-y-1 text-sm"
          data-test="person-shifts"
        >
          <li
            v-for="shift in work.slice(0, SHOWN_SHIFTS)"
            :key="shift.key"
          >
            {{ saysWhen(shift.startsAt) }}: {{ shift.role }}, {{ shift.what }} at {{ shift.venueName }}
            <span class="text-muted">({{ saysShiftStatus(shift.status).toLowerCase() }})</span>
          </li>
          <li
            v-if="work.length > SHOWN_SHIFTS"
            class="text-muted"
          >
            and {{ work.length - SHOWN_SHIFTS }} more.
          </li>
        </ul>
        <UButton
          class="mt-2"
          to="/rota/manage/shifts"
          variant="link"
          size="sm"
          icon="i-lucide-users-round"
          label="Open the rota board"
        />
      </div>
    </template>
  </UPageCard>
</template>
