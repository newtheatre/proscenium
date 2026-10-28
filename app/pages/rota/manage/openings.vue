<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import type { VNode } from 'vue'
import { londonClock } from '#shared/utils/london'
import { saysWhenLong } from '#shared/utils/when'
import { can, manageRota } from '#shared/utils/abilities'
import { ONLY_SLOT_HINT, saysBarOpeningStatus } from '#shared/utils/rota-openings'
import { rotaOpeningsList } from '#shared/utils/rota-openings-list'
import { saysShiftStatus } from '#shared/utils/rota'
import type { BarOpeningStatus } from '#shared/utils/rota-openings'
import type { ShiftStatus } from '#shared/utils/rota'
import type { TableColumn } from '@nuxt/ui'
import type { AssignCandidate } from '~/components/AssignShiftModal.vue'

definePageMeta({ layout: 'console', title: 'Bar openings', middleware: 'console', docs: '/docs/rota/bar-openings' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Opening {
  openingId: string
  venueId: string
  venueName: string
  night: string
  label: string
  startsAt: number
  endsAt: number
  status: BarOpeningStatus
}

interface Slot {
  slotId: string
  openingId: string
  slot: number
  status: ShiftStatus
  userId: string | null
  holderName: string | null
}

interface Listing {
  items: Opening[]
  slots: Slot[]
  page: number
  pageSize: number
  total: number
  pages: number
}

const request = useRequestFetch()
const toast = useToast()
// Tidiness rather than enforcement: the routes are what refuse (0040).
const writes = computed(() => can(useViewer().value, manageRota))
const failure = ref<string | null>(null)
const cancelling = ref<string | null>(null)
const planning = ref(false)

const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(rotaOpeningsList)

const empty = (): Listing => ({ items: [], slots: [], page: 1, pageSize: 0, total: 0, pages: 1 })

const { data: listing, status, refresh, error } = await useAsyncData(
  'rota-openings',
  () => request<Listing>('/api/rota/openings', { query: query.value }),
  { watch: [query], default: empty },
)
const readFailure = useListFailure(error, 'The bar openings could not be read.')

// A claim answered here is one off the sidebar's Rota badge, so it is read again (0253).
const { refresh: refreshCounts } = useNavCounts()
watch(listing, () => {
  void refreshCounts()
})

// Planned in its own dialogue, which the rota board opens from a night too (0252).
async function planned(): Promise<void> {
  planning.value = false
  await refresh()
}

const cancellingOpening = ref<Opening | null>(null)
const cancelFailure = ref<string | null>(null)

async function cancel(): Promise<void> {
  const opening = cancellingOpening.value
  if (!opening) return
  cancelling.value = opening.openingId
  cancelFailure.value = null
  try {
    const answer = await $fetch<{ shiftsCancelled: number }>(`/api/rota/openings/${opening.openingId}/cancel`, { method: 'POST' })
    toast.add({
      title: 'Bar opening cancelled',
      description: `${plural(answer.shiftsCancelled, 'slot')} cancelled. Whoever held one has been told.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    cancellingOpening.value = null
    await refresh()
  }
  catch (error) {
    cancelFailure.value = refusalText(error)
  }
  finally {
    cancelling.value = null
  }
}

const standingDown = ref<Slot | null>(null)
const standDownFailure = ref<string | null>(null)
const standDownWorking = ref(false)

async function standDown(): Promise<void> {
  const slot = standingDown.value
  if (!slot) return
  standDownWorking.value = true
  standDownFailure.value = null
  try {
    await $fetch(`/api/rota/openings/shifts/${slot.slotId}/unconfirm`, { method: 'POST' })
    toast.add({ title: `${slot.holderName ?? 'The holder'} stood down`, icon: 'i-lucide-check', color: 'success' })
    standingDown.value = null
    await refresh()
  }
  catch (error) {
    standDownFailure.value = refusalText(error)
  }
  finally {
    standDownWorking.value = false
  }
}

// A queued claim is worked here, where the opening is staffed (E-130 criterion 3), the same way
// the board works a shift's.
const { confirmingId, confirm, declining, declineOffered, declineFailure, declineWorking, openDecline, closeDecline, submitDecline } = useClaimAnswer<Slot>({
  route: slot => `/api/rota/openings/shifts/${slot.slotId}`,
  id: slot => slot.slotId,
  confirmedTitle: slot => `${slot.holderName ?? 'The claimant'} confirmed`,
  declinedDescription: slot => `${slot.holderName ?? 'The claimant'} is told why. The slot is back on offer once they dismiss it or you stand it down.`,
  failure,
  refresh,
})

// An officer puts somebody on an open or declined slot, as the rota board does (0250).
const assigning = ref<Slot | null>(null)
const assignWorking = ref(false)
const assignFailure = ref<string | null>(null)

async function assign(candidate: AssignCandidate): Promise<void> {
  const slot = assigning.value
  if (!slot) return
  assignWorking.value = true
  assignFailure.value = null
  try {
    await $fetch(`/api/rota/openings/shifts/${slot.slotId}/assign`, { method: 'POST', body: { userId: candidate.id } })
    toast.add({ title: `${candidate.name} assigned`, description: `Slot ${slot.slot}, confirmed.`, icon: 'i-lucide-check', color: 'success' })
    assigning.value = null
    await refresh()
  }
  catch (error) {
    assignFailure.value = refusalText(error)
  }
  finally {
    assignWorking.value = false
  }
}

const adding = ref<string | null>(null)

async function addSlot(opening: Opening): Promise<void> {
  adding.value = opening.openingId
  failure.value = null
  try {
    const answer = await $fetch<{ slot: number }>(`/api/rota/openings/${opening.openingId}/slots`, { method: 'POST' })
    toast.add({
      title: `Slot ${answer.slot} added`,
      description: `For ${opening.label} only. The venue's template is unchanged.`,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    adding.value = null
  }
}

const removing = ref<Slot | null>(null)
const removeFailure = ref<string | null>(null)
const removeWorking = ref(false)

async function removeSlot(): Promise<void> {
  const slot = removing.value
  if (!slot) return
  removeWorking.value = true
  removeFailure.value = null
  try {
    await $fetch(`/api/rota/openings/shifts/${slot.slotId}/remove`, { method: 'POST' })
    toast.add({ title: `Slot ${slot.slot} removed`, icon: 'i-lucide-check', color: 'success' })
    removing.value = null
    await refresh()
  }
  catch (error) {
    removeFailure.value = refusalText(error)
  }
  finally {
    removeWorking.value = false
  }
}

const slotsOf = (openingId: string): Slot[] => listing.value.slots.filter(slot => slot.openingId === openingId)
const staffedSlots = (openingId: string): number => slotsOf(openingId).filter(slot => slot.status !== 'CANCELLED').length

function spanOf(opening: Opening): string {
  const opens = saysWhenLong(opening.startsAt)
  return `${opens} to ${londonClock(new Date(opening.endsAt * 1000))}`
}

// One slot's line: at most two of its actions show at once, whichever its status allows.
function slotLine(slot: Slot, opening: Opening): VNode {
  return h('div', { class: 'flex items-center gap-2 text-sm' }, [
    h('span', {}, `Slot ${slot.slot}`),
    h(UBadge, {
      color: slot.status === 'CONFIRMED' ? 'success' : slot.status === 'OPEN' ? 'neutral' : 'warning',
      variant: 'subtle',
      size: 'sm',
    }, () => saysShiftStatus(slot.status)),
    h('span', { class: 'text-muted' }, slot.holderName ?? 'Nobody yet'),
    ...(writes.value && opening.status === 'PLANNED' && (slot.status === 'OPEN' || slot.status === 'DECLINED')
      ? [h(UButton, {
          'size': 'xs',
          'variant': 'subtle',
          'icon': 'i-lucide-user-plus',
          'data-test': `assign-${slot.slotId}`,
          'onClick': () => {
            assignFailure.value = null
            assigning.value = slot
          },
        }, () => 'Assign')]
      : []),
    ...(writes.value && slot.status === 'CLAIMED'
      ? [
          h(UButton, {
            'size': 'xs',
            'color': 'secondary',
            'variant': 'subtle',
            'icon': 'i-lucide-check',
            'loading': confirmingId.value === slot.slotId,
            'disabled': confirmingId.value !== null && confirmingId.value !== slot.slotId,
            'data-test': `confirm-${slot.slotId}`,
            'onClick': () => confirm(slot),
          }, () => 'Confirm'),
          h(UButton, {
            'size': 'xs',
            'color': 'error',
            'variant': 'ghost',
            'icon': 'i-lucide-x',
            'disabled': confirmingId.value === slot.slotId,
            'data-test': `decline-${slot.slotId}`,
            'onClick': () => openDecline(slot),
          }, () => 'Decline'),
        ]
      : []),
    // Standing down is the officer's way to reopen a declined slot; the member's is to dismiss it (E-114).
    ...(writes.value && (slot.status === 'CONFIRMED' || slot.status === 'DECLINED')
      ? [h(UButton, {
          'size': 'xs',
          'color': 'neutral',
          'variant': 'ghost',
          'data-test': `stand-down-${slot.slotId}`,
          'onClick': () => {
            standDownFailure.value = null
            standingDown.value = slot
          },
        }, () => 'Stand down')]
      : []),
    // Only an open slot is removed: one with a name on it is stood down first (E-130).
    ...(writes.value && slot.status === 'OPEN' && opening.status === 'PLANNED' && staffedSlots(opening.openingId) > 1
      ? [h(UButton, {
          'size': 'xs',
          'color': 'neutral',
          'variant': 'ghost',
          'data-test': `remove-slot-${slot.slotId}`,
          'onClick': () => {
            removeFailure.value = null
            removing.value = slot
          },
        }, () => 'Remove')]
      : []),
    ...(writes.value && slot.status === 'OPEN' && opening.status === 'PLANNED' && staffedSlots(opening.openingId) <= 1
      ? [h('span', { 'class': 'text-xs text-muted', 'data-test': `only-slot-${slot.slotId}` }, ONLY_SLOT_HINT)]
      : []),
  ])
}

const columns: TableColumn<Opening>[] = [
  {
    accessorKey: 'label',
    header: 'Opening',
    cell: ({ row }) => h('div', { 'data-test': `opening-${row.original.openingId}` }, [
      h('p', { class: 'font-medium' }, `${row.original.label}, ${row.original.venueName}`),
      h('p', { class: 'text-sm text-muted' }, spanOf(row.original)),
      // Below sm the status is hidden: shown here instead, so a phone keeps the staffing and the
      // row's action in view without losing what it said (issue 922).
      h('p', { class: 'sm:hidden text-xs text-muted' }, saysBarOpeningStatus(row.original.status)),
    ]),
  },
  {
    id: 'staffing',
    header: 'Staffing',
    cell: ({ row }) => h('div', { 'class': 'space-y-1', 'data-test': `staffing-${row.original.openingId}` }, [
      ...slotsOf(row.original.openingId).map(slot => slotLine(slot, row.original)),
      ...(writes.value && row.original.status === 'PLANNED'
        ? [h(UButton, {
            'size': 'xs',
            'color': 'neutral',
            'variant': 'outline',
            'icon': 'i-lucide-plus',
            'loading': adding.value === row.original.openingId,
            'data-test': `add-slot-${row.original.openingId}`,
            'onClick': () => addSlot(row.original),
          }, () => 'Add a slot')]
        : []),
    ]),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    meta: { class: { th: HIDE_BELOW_SM, td: HIDE_BELOW_SM } },
    cell: ({ row }) => h(UBadge, {
      color: row.original.status === 'PLANNED' ? 'success' : 'neutral',
      variant: 'subtle',
      size: 'sm',
    }, () => saysBarOpeningStatus(row.original.status)),
  },
  {
    id: 'act',
    header: ACTIONS_HEADER,
    meta: ACTIONS_COLUMN,
    cell: ({ row }) => (writes.value && row.original.status === 'PLANNED'
      ? h(UButton, {
          'size': 'sm',
          'color': 'error',
          'variant': 'ghost',
          'loading': cancelling.value === row.original.openingId,
          'data-test': `cancel-${row.original.openingId}`,
          'onClick': () => {
            cancelFailure.value = null
            cancellingOpening.value = row.original
          },
        }, () => 'Cancel')
      : null),
  },
]

// A page alert renders behind an open modal's overlay, where nobody can read it, so a refusal
// is shown wherever the action was taken.
const modalOpen = computed(() => planning.value || cancellingOpening.value !== null || standingDown.value !== null
  || removing.value !== null || declining.value !== null || assigning.value !== null)

watch(modalOpen, (nowOpen) => {
  if (nowOpen) return
  failure.value = null
})
</script>

<template>
  <ReadGate
    :failure="readFailure"
    class="space-y-6"
    @retry="refresh"
  >
    <UAlert
      v-if="failure && !modalOpen"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p class="text-sm text-muted">
      An evening with no performance, staffed like any other.
    </p>

    <p
      class="text-sm text-muted"
      data-test="template-pointer"
    >
      Each opening starts with its venue's usual bar count. Add or remove a slot here for one evening;
      to change the usual count, edit the venue on
      <ULink
        to="/rota/manage/templates"
        class="text-primary underline"
      >shift templates</ULink>.
    </p>

    <RotaTabs current="openings" />

    <RotaFlow step="openings" />

    <AdminToolbar
      v-model:search="search"
      :placeholder="rotaOpeningsList.search?.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="rotaOpeningsList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>
      <template #actions>
        <UButton
          v-if="writes"
          icon="i-lucide-plus"
          data-test="plan-opening"
          @click="planning = true"
        >
          Plan an opening
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="listing.items"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="openings-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'Nothing matches that.' : 'No bar openings planned. Plan one when the theatre opens the bar with nothing running.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="openings-total"
        class="text-sm text-muted"
      >
        {{ plural(listing.total, 'opening') }}
      </p>
      <UPagination
        v-if="listing.pages > 1"
        v-model:page="page"
        :total="listing.total"
        :items-per-page="listing.pageSize"
      />
    </div>

    <PlanOpeningModal
      :open="planning"
      @close="planning = false"
      @planned="planned"
    />

    <ConfirmModal
      :open="cancellingOpening !== null"
      name="cancel-opening"
      title="Cancel the opening"
      :verb="cancellingOpening ? `Cancel the ${cancellingOpening.label} opening` : ''"
      consequence="Every slot on it is cancelled and everybody holding one is told."
      :loading="cancelling !== null"
      :failure="cancelFailure"
      @update:open="value => { if (!value) cancellingOpening = null }"
      @confirm="cancel"
    />

    <ConfirmModal
      :open="standingDown !== null"
      name="stand-down"
      :title="standingDown ? `Stand ${standingDown.holderName ?? 'them'} down` : ''"
      :verb="standingDown ? `Stand ${standingDown.holderName ?? 'them'} down` : ''"
      consequence="The slot goes back on offer and they are told they are no longer on it."
      :loading="standDownWorking"
      :failure="standDownFailure"
      @update:open="value => { if (!value) standingDown = null }"
      @confirm="standDown"
    />

    <ConfirmModal
      :open="removing !== null"
      name="remove-slot"
      title="Remove the slot"
      :verb="removing ? `Remove slot ${removing.slot}` : ''"
      consequence="This opening needs one fewer person. The venue's template is unchanged."
      :loading="removeWorking"
      :failure="removeFailure"
      @update:open="value => { if (!value) removing = null }"
      @confirm="removeSlot"
    />

    <AssignShiftModal
      :open="assigning !== null"
      :target="assigning ? { kind: 'opening', id: assigning.slotId } : null"
      :loading="assignWorking"
      :failure="assignFailure"
      @close="assigning = null"
      @assign="assign"
    />

    <DeclineClaimModal
      :open="declining !== null"
      :title="declining ? `Decline ${declining.holderName ?? 'this claim'}` : ''"
      consequence="Say why: the claimant sees this word for word. The slot keeps their name until they dismiss it or you stand it down."
      :offered="declineOffered"
      :loading="declineWorking"
      :failure="declineFailure"
      @close="closeDecline"
      @decline="submitDecline"
    />
  </ReadGate>
</template>
