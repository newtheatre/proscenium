<script setup lang="ts">
import { formatLondon } from '#shared/utils/london'
import { saysShiftRole, saysShiftStatus, SHIFT_ROLES } from '#shared/utils/rota'
import type { ShiftRole, ShiftStatus } from '#shared/utils/rota'
import type { Page } from '#shared/utils/pagination'

definePageMeta({ layout: 'member', middleware: 'signed-in' })

interface MyShift {
  shiftId: string
  role: ShiftRole
  status: ShiftStatus
  performanceId: string
  venueName: string
  showTitle: string
  startsAt: number
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

const { data: mine } = await useFetch<{ items: MyShift[] }>('/api/rota/mine', {
  default: (): { items: MyShift[] } => ({ items: [] }),
})

const role = ref<ShiftRole | undefined>(undefined)
const page = ref(1)

const { data, status } = await useFetch<Page<OpenShift>>('/api/rota/shifts', {
  query: computed(() => ({ role: role.value, page: page.value })),
  watch: [role, page],
  default: (): Page<OpenShift> => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 }),
})

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
  <UContainer class="max-w-3xl py-16">
    <UPageHeader
      title="My rota"
      description="Shifts you already hold, and open ones you currently qualify for. What is locked names what would unlock it."
    />

    <section
      v-if="mine.items.length"
      class="mt-8"
      data-test="my-shifts"
    >
      <h2 class="nnt-headline text-lg">
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
                :color="shift.status === 'CONFIRMED' ? 'success' : 'warning'"
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
        </li>
      </ul>
    </section>

    <section class="mt-10">
      <h2 class="nnt-headline text-lg">
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
        v-else-if="data.items.length === 0"
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
        </li>
      </ul>

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
