<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, manageRota } from '#shared/utils/abilities'
import { MAX_SLOT_COUNT, SHIFT_ROLES, orderedSlots, saysShiftRole, templateRefusal } from '#shared/utils/rota'
import { rotaTemplatesList } from '#shared/utils/rota-templates-list'
import type { ShiftRole, TemplateSlot } from '#shared/utils/rota'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Shift templates', middleware: 'console' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface VenueTemplate {
  venueId: string
  venueName: string
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

function edit(venue: VenueTemplate): void {
  editing.value = venue
  for (const role of SHIFT_ROLES) {
    counts[role] = venue.slots.find(slot => slot.role === role)?.count ?? (role === 'DUTY_MANAGER' ? 1 : 0)
  }
  open.value = true
}

// A count of nought is a role this venue does not staff, so it is left out rather than saved.
const chosen = computed<TemplateSlot[]>(() =>
  SHIFT_ROLES.filter(role => counts[role] > 0).map(role => ({ role, count: counts[role] })))

const refusal = computed(() => templateRefusal(chosen.value))

const totalSlots = (slots: TemplateSlot[]): number =>
  slots.reduce((running, slot) => running + slot.count, 0)

async function save(): Promise<void> {
  const venue = editing.value
  if (!venue) return

  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/rota/templates/${venue.venueId}`, { method: 'PUT', body: { slots: chosen.value } })
    toast.add({
      title: 'Template saved',
      description: 'Performances added from now on are staffed from it. Stamp it to reach the ones already in the diary.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    open.value = false
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

async function remove(venue: VenueTemplate): Promise<void> {
  failure.value = null
  try {
    await $fetch(`/api/admin/rota/templates/${venue.venueId}`, { method: 'DELETE' })
    toast.add({
      title: 'Template removed',
      description: `Performances added at ${venue.venueName} from now on stamp nothing. Shifts already in the diary are untouched.`,
      icon: 'i-lucide-check',
    })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

async function stamp(venue: VenueTemplate): Promise<void> {
  failure.value = null
  try {
    const answer = await $fetch<{ stamped: number }>(`/api/admin/rota/templates/${venue.venueId}/stamp`, { method: 'POST' })
    toast.add({
      title: answer.stamped === 0 ? 'Nothing to add' : `${plural(answer.stamped, 'shift')} added`,
      description: answer.stamped === 0
        ? 'Every performance from tonight onwards already has its slots.'
        : 'Performances from tonight onwards now carry every slot the template asks for.',
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
    cell: ({ row }) => h('span', {}, row.original.venueName),
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
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => (writes.value === false
      ? null
      : h('div', { class: 'flex justify-end gap-1' }, [
          row.original.slots.length === 0
            ? null
            : h(UButton, {
                'size': 'sm',
                'variant': 'subtle',
                'data-test': `stamp-${row.original.venueId}`,
                'onClick': () => stamp(row.original),
              }, () => 'Stamp the diary'),
          h(UButton, {
            'size': 'sm',
            'color': 'neutral',
            'variant': 'ghost',
            'data-test': `edit-template-${row.original.venueId}`,
            'onClick': () => edit(row.original),
          }, () => (row.original.slots.length === 0 ? 'Set it up' : 'Edit')),
          row.original.slots.length === 0
            ? null
            : h(UButton, {
                'size': 'sm',
                'color': 'neutral',
                'variant': 'ghost',
                'data-test': `remove-template-${row.original.venueId}`,
                'onClick': () => remove(row.original),
              }, () => 'Remove'),
        ])),
  },
]
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-clipboard-list"
      title="A template is how a venue is staffed, and every performance is stamped from it"
      description="Adding a performance stamps one open shift per slot straight away. Editing a template changes nothing already stamped, so use Stamp the diary to reach performances that are already in it. Every venue template carries exactly one duty manager."
    />

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
      description="How many of each role every performance at this venue needs. A nought means the venue does not staff that role at all."
    >
      <template #body>
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
          Save it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="open = false"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
