<script setup lang="ts">
import { saysDay, saysWhenLong } from '#shared/utils/when'
import { ROTA_WEEKS, byNight, rotaWeekSpan, saysRotaWeek } from '#shared/utils/my-rota'
import { saysShiftRole, saysShiftStatus } from '#shared/utils/rota'
import { saysNotOpenYet } from '#shared/utils/rota-readiness'
import { saysWindow } from '#shared/utils/rota-times'
import { showNightOf } from '#shared/utils/show-night'
import { releaseStillOpen, telHref, tonightToolFor } from '#shared/utils/tonight'
import type { RotaWeek } from '#shared/utils/my-rota'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'
import type { Page } from '#shared/utils/pagination'
import type { TrainingAction } from '#shared/utils/training-action'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/my-nnt/my-rota' })

interface MyShift {
  shiftId: string
  role: ShiftRole
  status: ShiftStatus
  performanceId: string
  venueName: string
  showTitle: string
  startsAt: number
  windowStartsAt: number | null
  windowEndsAt: number | null
}

interface DutyManagerToTell { firstName: string, phone: string | null }

interface Mine { items: MyShift[], openings: MyOpeningShift[], dutyManagers: Record<string, DutyManagerToTell | null> }

// A slot on a bar opening: labelled by the opening and its venue, because there is no show to
// name (E-130 criterion 4, 0077).
interface MyOpeningShift {
  slotId: string
  openingId: string
  slot: number
  status: ShiftStatus
  label: string
  venueName: string
  startsAt: number
  endsAt: number
}

interface OpenOpeningShift {
  slotId: string
  openingId: string
  slot: number
  label: string
  venueId: string
  venueName: string
  startsAt: number
  endsAt: number
}

interface OpenShift {
  shiftId: string
  role: ShiftRole
  performanceId: string
  venueId: string
  venueName: string
  showTitle: string
  startsAt: number
}

const toast = useToast()

const { data: mine, error: mineError, refresh: refreshMine } = await useFetch<Mine>('/api/rota/mine', {
  default: (): Mine => ({ items: [], openings: [], dutyManagers: {} }),
})

// Tonight's shift stays until 04:00 as a card with its window and its screen; once its show night
// has begun the server refuses a release, so the duty manager is offered instead (0094, E-107).
const nowSeconds = Math.floor(Date.now() / 1000)
const tonight = showNightOf(new Date(nowSeconds * 1000))
const isTonight = (startsAt: number): boolean => showNightOf(new Date(startsAt * 1000)) === tonight

function windowOf(shift: MyShift): string {
  if (shift.windowStartsAt === null || shift.windowEndsAt === null) return spanOf(shift.startsAt)
  return `Tonight, ${saysWindow({ startsAt: shift.windowStartsAt, endsAt: shift.windowEndsAt })}`
}

const mineFailure = useListFailure(mineError, 'The shifts you hold could not be read.')

const week = ref<RotaWeek>('ALL')
const page = ref(1)

type OpenShifts = Page<OpenShift> & { openings: OpenOpeningShift[] }

// Only what this member can take: the roles they qualify for, and never a performance they already
// work, chosen by week and read by night (issue 1335, E-103 criterion 2 as trimmed).
const { data, status, error, refresh } = await useFetch<OpenShifts>('/api/rota/shifts', {
  query: computed(() => ({ claimable: 'true', page: page.value, ...rotaWeekSpan(week.value, showNightOf(new Date())) })),
  watch: [week, page],
  default: (): OpenShifts => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1, openings: [] }),
})

const openFailure = useListFailure(error, 'The shifts you can take could not be read.')
const nights = computed(() => byNight(data.value.items))

interface RoleCard { role: ShiftRole, openShifts: number, module: { id: string, name: string } | null, action: TrainingAction | null }

// Said once per role rather than on every locked row: what opens it, and the one thing to do.
const { data: locked, refresh: refreshRoles } = await useFetch<{ roles: RoleCard[], officers: string[] }>('/api/rota/roles', {
  default: () => ({ roles: [] as RoleCard[], officers: [] as string[] }),
})

const notOpenYet = computed(() => saysNotOpenYet(locked.value.officers))

function chooseWeek(one: RotaWeek): void {
  week.value = one
  page.value = 1
}

const claiming = ref<string | null>(null)
const releasing = ref<string | null>(null)
const dismissing = ref<string | null>(null)

// A duty manager's own shift has nobody listed, so its card says to tell the Front of House Manager.
const tellFor = (shift: MyShift): DutyManagerToTell | null => mine.value.dutyManagers[shift.performanceId] ?? null

function releasable(shift: MyShift): boolean {
  return (shift.status === 'CLAIMED' || shift.status === 'CONFIRMED') && releaseStillOpen(shift.startsAt, nowSeconds)
}

// A release is asked first, the same for a shift and a slot on an opening (E-107 criterion 8); a
// refusal stays in the dialogue that asked.
interface Releasing { id: string, route: string, says: string }
const releasingOne = ref<Releasing | null>(null)
const releaseFailure = ref<string | null>(null)
const releaseOpen = computed({
  get: () => releasingOne.value !== null,
  set: (value) => { if (!value) releasingOne.value = null },
})

function askToRelease(one: Releasing): void {
  releaseFailure.value = null
  releasingOne.value = one
}

const askToReleaseShift = (shift: MyShift): void => askToRelease({
  id: shift.shiftId,
  route: `/api/rota/shifts/${shift.shiftId}/release`,
  says: `${saysShiftRole(shift.role)} at ${shift.venueName}`,
})

const askToReleaseSlot = (slot: MyOpeningShift): void => askToRelease({
  id: slot.slotId,
  route: `/api/rota/openings/shifts/${slot.slotId}/release`,
  says: `${slot.label} at ${slot.venueName}`,
})

async function release(): Promise<void> {
  const one = releasingOne.value
  if (!one) return
  releaseFailure.value = null
  releasing.value = one.id
  try {
    await $fetch(one.route, { method: 'POST' })
    releasingOne.value = null
    toast.add({
      title: 'Released',
      description: `${one.says} is back on the open list.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await Promise.all([refresh(), refreshMine()])
  }
  catch (error) {
    releaseFailure.value = refusalText(error)
  }
  finally {
    releasing.value = null
  }
}

// A declined claim is a member's own to clear off "what you hold" (E-114).
async function dismiss(shift: MyShift): Promise<void> {
  dismissing.value = shift.shiftId
  try {
    await $fetch(`/api/rota/shifts/${shift.shiftId}/dismiss`, { method: 'POST' })
    await Promise.all([refresh(), refreshMine()])
  }
  catch (error) {
    toast.add({ title: 'Could not dismiss that', description: refusalText(error), icon: 'i-lucide-x', color: 'error' })
  }
  finally {
    dismissing.value = null
  }
}

async function dismissOpening(slot: MyOpeningShift): Promise<void> {
  dismissing.value = slot.slotId
  try {
    await $fetch(`/api/rota/openings/shifts/${slot.slotId}/dismiss`, { method: 'POST' })
    await Promise.all([refresh(), refreshMine()])
  }
  catch (error) {
    toast.add({ title: 'Could not dismiss that', description: refusalText(error), icon: 'i-lucide-x', color: 'error' })
  }
  finally {
    dismissing.value = null
  }
}

// The same race-safe claim the rota's own slots ride, under its own route because the slot lives
// in its own table (E-130 criterion 3, 0077).
async function claimOpening(slot: OpenOpeningShift): Promise<void> {
  claiming.value = slot.slotId
  try {
    const answer = await $fetch<{ status: 'CLAIMED' | 'CONFIRMED' }>(`/api/rota/openings/shifts/${slot.slotId}/claim`, { method: 'POST' })
    toast.add({
      title: answer.status === 'CONFIRMED' ? 'Slot confirmed' : 'Claim sent for approval',
      description: answer.status === 'CONFIRMED'
        ? `${slot.label} at ${slot.venueName} is yours.`
        : 'The FOH officer will confirm or decline it; you will be told either way.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    await Promise.all([refresh(), refreshMine()])
  }
  catch (error) {
    toast.add({ title: 'Could not claim that', description: refusalText(error), icon: 'i-lucide-x', color: 'error' })
  }
  finally {
    claiming.value = null
  }
}

async function claim(shift: OpenShift): Promise<void> {
  claiming.value = shift.shiftId
  try {
    const answer = await $fetch<{ status: 'CLAIMED' | 'CONFIRMED' }>(`/api/rota/shifts/${shift.shiftId}/claim`, { method: 'POST' })
    toast.add({
      title: answer.status === 'CONFIRMED' ? 'Shift confirmed' : 'Claim sent for approval',
      description: answer.status === 'CONFIRMED'
        ? `${saysShiftRole(shift.role)} at ${shift.venueName} is yours.`
        : 'The FOH officer will confirm or decline it; you will be told either way.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    await Promise.all([refresh(), refreshMine()])
  }
  catch (error) {
    toast.add({ title: 'Could not claim that', description: refusalText(error), icon: 'i-lucide-x', color: 'error' })
  }
  finally {
    claiming.value = null
  }
}

function spanOf(startsAt: number): string {
  return saysWhenLong(startsAt)
}

useSeoMeta({ title: 'Rota' })
</script>

<template>
  <UContainer
    :class="MEMBER_PAGE_READING"
    data-test="rota-page"
  >
    <UPageHeader
      title="Rota"
      description="Shifts you hold, the ones you can take, and what would open the roles you cannot take yet."
      :ui="MEMBER_PAGE_HEADER"
    />

    <ReadFailure
      v-if="mineFailure"
      :failure="mineFailure"
      class="mt-8"
      @retry="refreshMine()"
    />

    <section
      v-else-if="mine.items.length || mine.openings.length"
      class="mt-8"
      data-test="my-shifts"
    >
      <h2 class="text-lg font-semibold">
        What you hold
      </h2>
      <ul class="mt-4 divide-y divide-default">
        <li
          v-for="shift in mine.items"
          :key="shift.shiftId"
          class="flex flex-wrap items-start gap-3 py-4"
          :data-test="`my-shift-${shift.shiftId}`"
        >
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 font-medium">
              {{ saysShiftRole(shift.role) }}, {{ shift.venueName }}
              <UBadge
                :color="shift.status === 'CONFIRMED' ? 'success' : shift.status === 'DECLINED' ? 'error' : 'warning'"
                variant="subtle"
                size="sm"
              >
                {{ saysShiftStatus(shift.status) }}
              </UBadge>
            </p>
            <p class="text-sm text-muted">
              {{ isTonight(shift.startsAt) ? windowOf(shift) : spanOf(shift.startsAt) }}
            </p>
            <p class="text-sm">
              {{ shift.showTitle }}
            </p>
            <!-- Tonight's confirmed shift: its own screen, and who to tell in place of a release. -->
            <div
              v-if="shift.status === 'CONFIRMED' && isTonight(shift.startsAt)"
              class="mt-3 flex flex-wrap items-center gap-2"
              data-test="tonight-card"
            >
              <UButton
                :to="tonightToolFor(shift.role).to"
                size="lg"
                icon="i-lucide-moon-star"
                class="min-h-12"
                :data-test="`tonight-tool-${shift.shiftId}`"
              >
                {{ tonightToolFor(shift.role).label }}
              </UButton>
              <UButton
                v-if="tellFor(shift)?.phone"
                :to="telHref(tellFor(shift)!.phone!)"
                external
                size="lg"
                color="neutral"
                variant="subtle"
                icon="i-lucide-phone"
                class="min-h-12"
                data-test="tell-duty-manager"
              >
                Tell {{ tellFor(shift)!.firstName }}
              </UButton>
              <p
                v-else
                class="text-sm text-muted"
                data-test="tell-duty-manager"
              >
                {{ tellFor(shift)
                  ? `Cannot make it? Tell ${tellFor(shift)!.firstName}, tonight's duty manager.`
                  : 'Cannot make it? Tell the Front of House Manager.' }}
              </p>
            </div>
          </div>
          <UButton
            v-if="releasable(shift)"
            size="sm"
            color="neutral"
            variant="subtle"
            :loading="releasing === shift.shiftId"
            :data-test="`release-${shift.shiftId}`"
            @click="askToReleaseShift(shift)"
          >
            Release the shift
          </UButton>
          <UButton
            v-else-if="shift.status === 'DECLINED'"
            size="sm"
            color="neutral"
            variant="subtle"
            :loading="dismissing === shift.shiftId"
            :data-test="`dismiss-${shift.shiftId}`"
            @click="dismiss(shift)"
          >
            Dismiss
          </UButton>
        </li>
        <li
          v-for="slot in mine.openings"
          :key="slot.slotId"
          class="flex flex-wrap items-start gap-3 py-4"
          :data-test="`my-opening-${slot.slotId}`"
        >
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 font-medium">
              Bar, {{ slot.venueName }}
              <UBadge
                :color="slot.status === 'CONFIRMED' ? 'success' : slot.status === 'DECLINED' ? 'error' : 'warning'"
                variant="subtle"
                size="sm"
              >
                {{ saysShiftStatus(slot.status) }}
              </UBadge>
            </p>
            <p class="text-sm text-muted">
              {{ spanOf(slot.startsAt) }}
            </p>
            <p class="text-sm">
              {{ slot.label }}
            </p>
            <UButton
              v-if="slot.status === 'CONFIRMED' && isTonight(slot.startsAt)"
              :to="tonightToolFor('BAR').to"
              size="lg"
              icon="i-lucide-moon-star"
              class="mt-3 min-h-12"
              :data-test="`tonight-tool-opening-${slot.slotId}`"
            >
              {{ tonightToolFor('BAR').label }}
            </UButton>
          </div>
          <UButton
            v-if="(slot.status === 'CLAIMED' || slot.status === 'CONFIRMED') && releaseStillOpen(slot.startsAt, nowSeconds)"
            size="sm"
            color="neutral"
            variant="subtle"
            :loading="releasing === slot.slotId"
            :data-test="`release-opening-${slot.slotId}`"
            @click="askToReleaseSlot(slot)"
          >
            Release the shift
          </UButton>
          <UButton
            v-else-if="slot.status === 'DECLINED'"
            size="sm"
            color="neutral"
            variant="subtle"
            :loading="dismissing === slot.slotId"
            :data-test="`dismiss-opening-${slot.slotId}`"
            @click="dismissOpening(slot)"
          >
            Dismiss
          </UButton>
        </li>
      </ul>
    </section>

    <section
      class="mt-10"
      data-test="shifts-you-can-take"
    >
      <h2 class="text-lg font-semibold">
        Shifts you can take
      </h2>

      <UFieldGroup class="mt-4">
        <UButton
          v-for="one in ROTA_WEEKS"
          :key="one"
          :color="week === one ? 'primary' : 'neutral'"
          variant="outline"
          :aria-pressed="week === one"
          :icon="week === one ? 'i-lucide-check' : undefined"
          :data-test="`week-${one}`"
          @click="chooseWeek(one)"
        >
          {{ saysRotaWeek(one) }}
        </UButton>
      </UFieldGroup>

      <div
        v-if="status === 'pending'"
        class="mt-8 flex items-center gap-3 text-muted"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="animate-spin"
        />
        <span>Reading the shifts you can take.</span>
      </div>

      <ReadFailure
        v-else-if="openFailure"
        :failure="openFailure"
        class="mt-8"
        @retry="refresh()"
      />

      <p
        v-else-if="data.items.length === 0 && data.openings.length === 0"
        class="mt-8 text-sm text-muted"
        data-test="open-shifts-empty"
      >
        Nothing you can take {{ week === 'ALL' ? 'is open' : `is open ${saysRotaWeek(week).toLowerCase()}` }}. A shift
        appears here as soon as one is put up for a role you hold the training for, and a night you
        already work is left out.
      </p>

      <div
        v-else
        class="mt-6 space-y-6"
        data-test="open-shifts-list"
      >
        <section
          v-for="group in nights"
          :key="group.night"
          :data-test="`night-${group.night}`"
        >
          <h3 class="text-base font-semibold">
            {{ saysDay(group.night) }}
          </h3>
          <ul class="mt-2 divide-y divide-default">
            <li
              v-for="shift in group.items"
              :key="shift.shiftId"
              class="flex flex-wrap items-center gap-3 py-3"
              :data-test="`open-shift-${shift.shiftId}`"
            >
              <div class="min-w-0 flex-1">
                <p class="font-medium">
                  {{ saysShiftRole(shift.role) }}, {{ shift.venueName }}
                </p>
                <p class="text-sm text-muted">
                  {{ spanOf(shift.startsAt) }} · {{ shift.showTitle }}
                </p>
              </div>
              <UButton
                size="lg"
                class="min-h-12"
                :loading="claiming === shift.shiftId"
                :data-test="`claim-${shift.shiftId}`"
                @click="claim(shift)"
              >
                Claim
              </UButton>
            </li>
          </ul>
        </section>
      </div>

      <section
        v-if="data.openings.length && page === 1 && status !== 'pending'"
        class="mt-8"
        data-test="open-opening-slots"
      >
        <h3 class="text-base font-semibold">
          Bar openings
        </h3>
        <p class="mt-1 text-sm text-muted">
          Evenings with no performance: a hire, a social or a get-in. The bar runs exactly as it
          does on a show night.
        </p>
        <ul class="mt-4 divide-y divide-default">
          <li
            v-for="slot in data.openings"
            :key="slot.slotId"
            class="flex flex-wrap items-center gap-3 py-3"
            :data-test="`open-opening-${slot.slotId}`"
          >
            <div class="min-w-0 flex-1">
              <p class="font-medium">
                Bar, {{ slot.venueName }}
              </p>
              <p class="text-sm text-muted">
                {{ spanOf(slot.startsAt) }} · {{ slot.label }}
              </p>
            </div>
            <UButton
              size="lg"
              class="min-h-12"
              :loading="claiming === slot.slotId"
              :data-test="`claim-opening-${slot.slotId}`"
              @click="claimOpening(slot)"
            >
              Claim
            </UButton>
          </li>
        </ul>
      </section>

      <div
        v-if="data.pages > 1"
        class="mt-6 flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="data.total"
          :items-per-page="data.pageSize"
        />
      </div>
    </section>

    <section
      v-if="locked.roles.length > 0"
      class="mt-10"
      data-test="roles-you-could-take"
    >
      <h2 class="text-lg font-semibold">
        Roles you could take
      </h2>
      <p class="mt-1 text-sm text-muted">
        Each needs a piece of training you do not hold yet. Doing it opens every shift of that role.
      </p>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <UPageCard
          v-for="card in locked.roles"
          :key="card.role"
          variant="outline"
          :title="saysShiftRole(card.role)"
          :description="card.openShifts === 0 ? 'No shifts open at the moment.' : `${plural(card.openShifts, 'shift')} open.`"
          :data-test="`role-card-${card.role}`"
        >
          <p
            v-if="card.module"
            class="text-sm"
          >
            Opened by
            <ULink :to="`/training/modules/${card.module.id}`">
              {{ card.module.name }}
            </ULink>
          </p>
          <p
            v-else
            class="text-sm text-muted"
          >
            {{ notOpenYet }}
          </p>
          <TrainingModuleAction
            v-if="card.module && card.action"
            class="mt-3"
            :module-id="card.module.id"
            :module-name="card.module.name"
            :action="card.action"
            large
            @changed="refreshRoles()"
          />
        </UPageCard>
      </div>
    </section>

    <ConfirmModal
      v-model:open="releaseOpen"
      name="release-shift"
      title="Release the shift"
      verb="Release the shift"
      :consequence="releasingOne ? `${releasingOne.says} goes back on the open list for anyone who qualifies. Having it back means claiming it again, if it is still free.` : undefined"
      :loading="releasing !== null"
      :failure="releaseFailure"
      @confirm="release"
    />
  </UContainer>
</template>
