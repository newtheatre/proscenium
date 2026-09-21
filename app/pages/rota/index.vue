<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysShiftRole, saysShiftStatus, SHIFT_ROLES } from '#shared/utils/rota'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'
import type { Page } from '#shared/utils/pagination'

definePageMeta({ layout: 'member', middleware: 'signed-in', docs: '/docs/members/your-rota' })

interface MyShift {
  shiftId: string
  role: ShiftRole
  status: ShiftStatus
  performanceId: string
  venueName: string
  showTitle: string
  startsAt: number
}

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
  eligible: boolean
  unlockedBy: { moduleId: string, moduleName: string } | null
}

interface OpenShift {
  shiftId: string
  role: ShiftRole
  performanceId: string
  venueId: string
  venueName: string
  showTitle: string
  startsAt: number
  eligible: boolean
  unlockedBy: { moduleId: string, moduleName: string } | null
}

const toast = useToast()

const { data: mine, refresh: refreshMine } = await useFetch<{ items: MyShift[], openings: MyOpeningShift[] }>('/api/rota/mine', {
  default: (): { items: MyShift[], openings: MyOpeningShift[] } => ({ items: [], openings: [] }),
})

const role = ref<ShiftRole | undefined>(undefined)
const page = ref(1)

type OpenShifts = Page<OpenShift> & { openings: OpenOpeningShift[] }

const { data, status, refresh } = await useFetch<OpenShifts>('/api/rota/shifts', {
  query: computed(() => ({ role: role.value, page: page.value })),
  watch: [role, page],
  default: (): OpenShifts => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1, openings: [] }),
})

const claiming = ref<string | null>(null)
const releasing = ref<string | null>(null)
const dismissing = ref<string | null>(null)

function releasable(shift: MyShift): boolean {
  return shift.status === 'CLAIMED' || shift.status === 'CONFIRMED'
}

async function release(shift: MyShift): Promise<void> {
  releasing.value = shift.shiftId
  try {
    await $fetch(`/api/rota/shifts/${shift.shiftId}/release`, { method: 'POST' })
    toast.add({
      title: 'Released',
      description: `${saysShiftRole(shift.role)} at ${shift.venueName} is back on the open list.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await Promise.all([refresh(), refreshMine()])
  }
  catch (error) {
    toast.add({ title: 'Could not release that', description: refusalText(error), icon: 'i-lucide-x', color: 'error' })
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

// A slot on an opening is given back and cleared exactly as a shift is (E-107, E-114).
async function releaseOpening(slot: MyOpeningShift): Promise<void> {
  releasing.value = slot.slotId
  try {
    await $fetch(`/api/rota/openings/shifts/${slot.slotId}/release`, { method: 'POST' })
    toast.add({
      title: 'Released',
      description: `${slot.label} at ${slot.venueName} is back on the open list.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await Promise.all([refresh(), refreshMine()])
  }
  catch (error) {
    toast.add({ title: 'Could not release that', description: refusalText(error), icon: 'i-lucide-x', color: 'error' })
  }
  finally {
    releasing.value = null
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
  return formatLondon(new Date(startsAt * 1000), { dateStyle: 'full', timeStyle: 'short' })
}

function selectRole(one: ShiftRole | undefined): void {
  role.value = one
  page.value = 1
}

useSeoMeta({ title: 'My rota' })
</script>

<template>
  <UContainer
    :class="MEMBER_PAGE_READING"
    data-test="rota-page"
  >
    <UPageHeader
      title="My rota"
      description="Shifts you already hold, and open ones you currently qualify for. What is locked names what would unlock it."
    />

    <section
      v-if="mine.items.length || mine.openings.length"
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
              {{ spanOf(shift.startsAt) }}
            </p>
            <p class="text-sm">
              {{ shift.showTitle }}
            </p>
          </div>
          <UButton
            v-if="releasable(shift)"
            size="sm"
            color="neutral"
            variant="subtle"
            :loading="releasing === shift.shiftId"
            :data-test="`release-${shift.shiftId}`"
            @click="release(shift)"
          >
            Release
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
          </div>
          <UButton
            v-if="slot.status === 'CLAIMED' || slot.status === 'CONFIRMED'"
            size="sm"
            color="neutral"
            variant="subtle"
            :loading="releasing === slot.slotId"
            :data-test="`release-opening-${slot.slotId}`"
            @click="releaseOpening(slot)"
          >
            Release
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

    <section class="mt-10">
      <h2 class="text-lg font-semibold">
        Open shifts
      </h2>

      <UFieldGroup class="mt-4">
        <UButton
          :color="role === undefined ? 'primary' : 'neutral'"
          variant="outline"
          data-test="role-filter-all"
          @click="selectRole(undefined)"
        >
          All roles
        </UButton>
        <UButton
          v-for="one in SHIFT_ROLES"
          :key="one"
          :color="role === one ? 'primary' : 'neutral'"
          variant="outline"
          :data-test="`role-filter-${one}`"
          @click="selectRole(one)"
        >
          {{ saysShiftRole(one) }}
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
        <span>Reading the open shifts.</span>
      </div>

      <p
        v-else-if="data.items.length === 0 && data.openings.length === 0"
        class="mt-8 text-sm text-muted"
        data-test="open-shifts-empty"
      >
        Nothing open right now.
      </p>

      <ul
        v-else
        class="mt-8 divide-y divide-default"
        data-test="open-shifts-list"
      >
        <li
          v-for="shift in data.items"
          :key="shift.shiftId"
          class="flex flex-wrap items-start gap-3 py-4"
          :data-test="`open-shift-${shift.shiftId}`"
        >
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 font-medium">
              {{ saysShiftRole(shift.role) }}, {{ shift.venueName }}
              <UBadge
                :color="shift.eligible ? 'success' : 'neutral'"
                variant="subtle"
                size="sm"
                :data-test="`eligibility-${shift.shiftId}`"
              >
                {{ shift.eligible ? 'You qualify' : 'Locked' }}
              </UBadge>
            </p>
            <p class="text-sm text-muted">
              {{ spanOf(shift.startsAt) }}
            </p>
            <p class="text-sm">
              {{ shift.showTitle }}
            </p>
            <p
              v-if="!shift.eligible && shift.unlockedBy"
              class="mt-1 text-sm"
              :data-test="`unlock-${shift.shiftId}`"
            >
              Unlocked by
              <ULink :to="`/training/modules/${shift.unlockedBy.moduleId}`">
                {{ shift.unlockedBy.moduleName }}
              </ULink>
            </p>
            <p
              v-else-if="!shift.eligible"
              class="mt-1 text-sm text-muted"
              :data-test="`unlock-${shift.shiftId}`"
            >
              Not open for claiming yet: the committee has not named what unlocks this role.
            </p>
          </div>
          <UButton
            v-if="shift.eligible"
            size="sm"
            :loading="claiming === shift.shiftId"
            :data-test="`claim-${shift.shiftId}`"
            @click="claim(shift)"
          >
            Claim
          </UButton>
        </li>
      </ul>

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
            class="flex flex-wrap items-start gap-3 py-4"
            :data-test="`open-opening-${slot.slotId}`"
          >
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 font-medium">
                Bar, {{ slot.venueName }}
                <UBadge
                  :color="slot.eligible ? 'success' : 'neutral'"
                  variant="subtle"
                  size="sm"
                >
                  {{ slot.eligible ? 'You qualify' : 'Locked' }}
                </UBadge>
              </p>
              <p class="text-sm text-muted">
                {{ spanOf(slot.startsAt) }}
              </p>
              <p class="text-sm">
                {{ slot.label }}
              </p>
              <p
                v-if="!slot.eligible && slot.unlockedBy"
                class="mt-1 text-sm"
                :data-test="`unlock-opening-${slot.slotId}`"
              >
                Unlocked by
                <ULink :to="`/training/modules/${slot.unlockedBy.moduleId}`">
                  {{ slot.unlockedBy.moduleName }}
                </ULink>
              </p>
              <p
                v-else-if="!slot.eligible"
                class="mt-1 text-sm text-muted"
                :data-test="`unlock-opening-${slot.slotId}`"
              >
                Not open for claiming yet: the committee has not named what unlocks the bar.
              </p>
            </div>
            <UButton
              v-if="slot.eligible"
              size="sm"
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
        v-if="data.items.length"
        class="mt-6 flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="data.total"
          :items-per-page="data.pageSize"
        />
      </div>
    </section>
  </UContainer>
</template>
