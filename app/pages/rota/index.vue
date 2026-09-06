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

const toast = useToast()

const { data: mine, refresh: refreshMine } = await useFetch<{ items: MyShift[] }>('/api/rota/mine', {
  default: (): { items: MyShift[] } => ({ items: [] }),
})

const role = ref<ShiftRole | undefined>(undefined)
const page = ref(1)

const { data, status, refresh } = await useFetch<Page<OpenShift>>('/api/rota/shifts', {
  query: computed(() => ({ role: role.value, page: page.value })),
  watch: [role, page],
  default: (): Page<OpenShift> => ({ items: [], page: 1, pageSize: 25, total: 0, pages: 1 }),
})

const claiming = ref<string | null>(null)
const releasing = ref<string | null>(null)

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
