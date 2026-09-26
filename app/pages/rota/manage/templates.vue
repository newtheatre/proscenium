<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, manageRota } from '#shared/utils/abilities'
import { MAX_SHIFT_OFFSET_MINUTES, MAX_SLOT_COUNT, SHIFT_ROLES, orderedSlots, saysShiftRole, templateRefusal } from '#shared/utils/rota'
import { rotaTemplatesList } from '#shared/utils/rota-templates-list'
import type { ShiftRole, TemplateSlot } from '#shared/utils/rota'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Shift templates', middleware: 'console', docs: '/docs/rota/shift-templates' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface VenueTemplate {
  venueId: string
  venueName: string
  archived: boolean
  slots: TemplateSlot[]
}

interface Listing {
  venues: VenueTemplate[]
  page: number
  pageSize: number
  total: number
  pages: number
}

const request = useRequestFetch()
const toast = useToast()
// Tidiness rather than enforcement: the routes are what refuse, and this is what stops a reader
// being shown three buttons that all answer 403 (0040).
const writes = computed(() => can(useViewer().value, manageRota))
const failure = ref<string | null>(null)
const saving = ref(false)

// Search, filters, sort and page live in the URL (K-129).
const { search, conditions, sort, page, query, active, filtered, set, setSort, clear } = useListQuery(rotaTemplatesList)

const empty = (): Listing => ({ venues: [], page: 1, pageSize: 0, total: 0, pages: 1 })

const { data, status, refresh } = await useAsyncData(
  'rota-shift-templates',
  () => request<Listing>('/api/admin/rota/templates', { query: query.value }),
  { watch: [query], default: empty },
)

const editing = ref<VenueTemplate | null>(null)
const open = ref(false)
const counts = reactive<Record<ShiftRole, number>>({ DUTY_MANAGER: 1, DOOR: 0, BAR: 0 })

// Blank means this venue has never been asked, and the shift takes the configured default (0078).
// Null is an empty field, which is the venue taking the house default rather than nought (0078).
const offsets = reactive<Record<ShiftRole, { start: number | null, end: number | null }>>({
  DUTY_MANAGER: { start: null, end: null },
  DOOR: { start: null, end: null },
  BAR: { start: null, end: null },
})

function edit(venue: VenueTemplate): void {
  editing.value = venue
  for (const role of SHIFT_ROLES) {
    const slot = venue.slots.find(one => one.role === role)
    counts[role] = slot?.count ?? (role === 'DUTY_MANAGER' ? 1 : 0)
    offsets[role] = { start: slot?.startsBeforeDoorsMinutes ?? null, end: slot?.endsAfterEndMinutes ?? null }
  }
  open.value = true
}

// A count of nought is a role this venue does not staff, so it is left out rather than saved.
const chosen = computed<TemplateSlot[]>(() =>
  SHIFT_ROLES.filter(role => counts[role] > 0).map(role => ({
    role,
    count: counts[role],
    startsBeforeDoorsMinutes: offsets[role].start,
    endsAfterEndMinutes: offsets[role].end,
  })))

const refusal = computed(() => templateRefusal(chosen.value))

const totalSlots = (slots: TemplateSlot[]): number =>
  slots.reduce((running, slot) => running + slot.count, 0)

async function save(): Promise<void> {
  const venue = editing.value
  if (!venue) return

  saving.value = true
  failure.value = null
  try {
    const answer = await $fetch<{ stamped: number }>(`/api/admin/rota/templates/${venue.venueId}`, { method: 'PUT', body: { slots: chosen.value } })
    toast.add({
      title: 'Template saved',
      description: (answer.stamped === 0
        ? 'Performances added from now on are staffed from it.'
        : `${plural(answer.stamped, 'shift')} stamped onto the performances that had none.`)
      + ' Nights already stamped keep their shifts: Stamp the diary adds any slot they miss.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    open.value = false
    await Promise.all([refresh(), refreshNuxtData('rota-readiness')])
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

const removing = ref<VenueTemplate | null>(null)
const removeFailure = ref<string | null>(null)
const removeWorking = ref(false)

async function remove(): Promise<void> {
  const venue = removing.value
  if (!venue) return
  removeWorking.value = true
  removeFailure.value = null
  try {
    await $fetch(`/api/admin/rota/templates/${venue.venueId}`, { method: 'DELETE' })
    toast.add({
      title: 'Template removed',
      description: `Performances added at ${venue.venueName} from now on stamp nothing. Shifts already in the diary are untouched.`,
      icon: 'i-lucide-check',
    })
    removing.value = null
    await Promise.all([refresh(), refreshNuxtData('rota-readiness')])
  }
  catch (error) {
    removeFailure.value = refusalText(error)
  }
  finally {
    removeWorking.value = false
  }
}

async function stamp(venue: VenueTemplate): Promise<void> {
  failure.value = null
  try {
    const answer = await $fetch<{ stamped: number, filled: number }>(`/api/admin/rota/templates/${venue.venueId}/stamp`, { method: 'POST' })
    const said = answer.filled === 0 ? '' : ` ${plural(answer.filled, 'shift')} gained the times its template asks for.`
    toast.add({
      title: answer.stamped === 0 ? 'Nothing to add' : `${plural(answer.stamped, 'shift')} added`,
      description: (answer.stamped === 0
        ? 'Every performance from tonight onwards already has its slots.'
        : 'Performances from tonight onwards now carry every slot the template asks for.') + said,
      icon: 'i-lucide-check',
      color: 'success',
    })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

const columns: TableColumn<VenueTemplate>[] = [
  {
    id: 'venue',
    header: 'Venue',
    // A retired venue is here only because it still holds a template, which Remove clears.
    cell: ({ row }) => (row.original.archived
      ? h('span', { class: 'flex items-center gap-2' }, [
          h('span', {}, row.original.venueName),
          h(UBadge, { color: 'neutral', variant: 'outline', size: 'sm' }, () => 'Retired'),
        ])
      : h('span', {}, row.original.venueName)),
  },
  {
    id: 'slots',
    header: 'Every performance is staffed with',
    cell: ({ row }) => (row.original.slots.length === 0
      ? h('span', { class: 'text-sm text-muted' }, 'Nothing, so its performances show as unstaffed')
      : h('div', { class: 'flex flex-wrap gap-2' }, orderedSlots(row.original.slots).map(slot =>
          h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' },
            () => `${slot.count} × ${saysShiftRole(slot.role)}`)))),
  },
  {
    id: 'act',
    header: ACTIONS_HEADER,
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => (writes.value === false
      ? null
      : h('div', { class: 'flex justify-end gap-1' }, [
          row.original.slots.length === 0 || row.original.archived
            ? null
            : h(UButton, {
                'size': 'sm',
                'variant': 'subtle',
                'data-test': `stamp-${row.original.venueId}`,
                'onClick': () => stamp(row.original),
              }, () => 'Stamp the diary'),
          row.original.archived
            ? null
            : h(UButton, {
                'size': 'sm',
                'color': 'neutral',
                'variant': 'ghost',
                'data-test': `edit-template-${row.original.venueId}`,
                'onClick': () => edit(row.original),
              }, () => (row.original.slots.length === 0 ? 'Set up the template' : 'Edit')),
          row.original.slots.length === 0
            ? null
            : h(UButton, {
                'size': 'sm',
                'color': 'neutral',
                'variant': 'ghost',
                'data-test': `remove-template-${row.original.venueId}`,
                'onClick': () => {
                  removeFailure.value = null
                  removing.value = row.original
                },
              }, () => 'Remove'),
        ])),
  },
]

// A page alert renders behind an open modal's overlay, where nobody can read it, so a refusal
// is shown wherever the action was taken.
const modalOpen = computed(() => open.value || removing.value !== null)

watch(modalOpen, (nowOpen) => {
  if (!nowOpen) failure.value = null
})
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure && !modalOpen"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <p class="text-sm text-muted">
      How each venue is staffed for a performance.
    </p>

    <RotaFlow step="templates" />

    <RotaReadiness />

    <AdminToolbar
      v-model:search="search"
      :placeholder="rotaTemplatesList.search?.placeholder"
      :active="active"
      :loading="status === 'pending'"
      @clear="clear"
    >
      <template #filters>
        <ConsoleFilters
          :spec="rotaTemplatesList"
          :conditions="conditions"
          :sort="sort"
          @set="set"
          @sort="setSort"
        />
      </template>
    </AdminToolbar>

    <UTable
      :data="data.venues"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="templates-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          {{ filtered ? 'No venue matches that.' : 'No venues yet. A template belongs to a venue, so add one first.' }}
        </p>
      </template>
    </UTable>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <p
        data-test="templates-total"
        class="text-sm text-muted"
      >
        {{ plural(data.total, 'venue') }}
      </p>
      <UPagination
        v-if="data.pages > 1"
        v-model:page="page"
        :total="data.total"
        :items-per-page="data.pageSize"
      />
    </div>

    <UModal
      v-model:open="open"
      :title="editing ? `Staffing for ${editing.venueName}` : ''"
      description="How many of each role every performance at this venue needs, and when each is worked. A nought means the venue does not staff that role at all. Editing this changes nothing already stamped."
    >
      <template #body>
        <UAlert
          v-if="failure"
          data-test="failure"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="failure"
        />
        <div class="space-y-4">
          <UFormField
            v-for="role in SHIFT_ROLES"
            :key="role"
            :label="saysShiftRole(role)"
            :description="role === 'DUTY_MANAGER' ? 'Exactly one. The night cannot legally run without one.' : undefined"
          >
            <UInputNumber
              v-model="counts[role]"
              :min="0"
              :max="MAX_SLOT_COUNT"
              class="w-full"
              :data-test="`slot-${role}`"
            />

            <div
              v-if="counts[role] > 0"
              class="mt-2 grid grid-cols-2 gap-2"
            >
              <UFormField
                label="Starts before doors"
                :description="`Minutes. Blank takes the house default.`"
              >
                <UInputNumber
                  v-model="offsets[role].start"
                  :min="0"
                  :max="MAX_SHIFT_OFFSET_MINUTES"
                  placeholder="Default"
                  class="w-full"
                  :data-test="`starts-before-${role}`"
                />
              </UFormField>
              <UFormField
                label="Ends after the show"
                description="Minutes. Blank takes the house default."
              >
                <UInputNumber
                  v-model="offsets[role].end"
                  :min="0"
                  :max="MAX_SHIFT_OFFSET_MINUTES"
                  placeholder="Default"
                  class="w-full"
                  :data-test="`ends-after-${role}`"
                />
              </UFormField>
            </div>
          </UFormField>

          <UAlert
            v-if="refusal"
            color="warning"
            variant="subtle"
            data-test="template-refusal"
            :description="refusal"
          />

          <p class="text-sm text-muted">
            {{ plural(totalSlots(chosen), 'shift') }} on every performance.
          </p>
        </div>
      </template>

      <template #footer>
        <UButton
          :loading="saving"
          :disabled="refusal !== null"
          data-test="template-submit"
          @click="save"
        >
          Save the template
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="open = false"
        >
          {{ CONFIRM_BACK_LABEL }}
        </UButton>
      </template>
    </UModal>

    <ConfirmModal
      :open="removing !== null"
      name="remove-template"
      :title="removing ? `Remove the ${removing.venueName} template` : ''"
      :verb="removing ? `Remove the ${removing.venueName} template` : ''"
      consequence="Performances added there from now on stamp nothing. Nights already stamped keep their shifts."
      :loading="removeWorking"
      :failure="removeFailure"
      @update:open="value => { if (!value) removing = null }"
      @confirm="remove"
    />
  </div>
</template>
