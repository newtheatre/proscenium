<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, editSettings, manageRota, viewSettings } from '#shared/utils/abilities'
import { MAX_PAGE_SIZE } from '#shared/utils/pagination'
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

// The mapping is configuration, not rota data, so it is its own ability: a rota manager with no
// config.read never sees the card, and 0040's convention (hide, not merely disable) still holds.
const seesEligibility = computed(() => can(useViewer().value, viewSettings))
const editsEligibility = computed(() => can(useViewer().value, editSettings))

const ELIGIBILITY_KEYS: Record<ShiftRole, string> = {
  DUTY_MANAGER: 'SHIFT_ELIGIBILITY_DUTY_MANAGER_MODULE',
  DOOR: 'SHIFT_ELIGIBILITY_DOOR_MODULE',
  BAR: 'SHIFT_ELIGIBILITY_BAR_MODULE',
}

interface ConfigSetting { key: string, value: unknown }
interface ModuleCandidate { id: string, name: string }

const { data: eligibilitySettings, refresh: refreshEligibility } = await useAsyncData(
  'rota-shift-eligibility',
  () => (seesEligibility.value
    ? request<{ settings: ConfigSetting[] }>('/api/admin/config')
    : Promise.resolve({ settings: [] as ConfigSetting[] })),
  { default: () => ({ settings: [] as ConfigSetting[] }) },
)

// Every module is a candidate here, not the current page of some other table's search (K-129).
const { data: eligibilityModules } = await useAsyncData(
  'rota-shift-eligibility-modules',
  () => (seesEligibility.value
    ? request<{ items: ModuleCandidate[] }>('/api/admin/training/modules', { query: { pageSize: MAX_PAGE_SIZE } })
    : Promise.resolve({ items: [] as ModuleCandidate[] })),
  { default: () => ({ items: [] as ModuleCandidate[] }) },
)

const moduleOptions = computed(() => eligibilityModules.value.items.map(one => ({ label: `${one.id} ${one.name}`, value: one.id })))
const moduleName = (moduleId: string | null): string | null =>
  moduleId === null ? null : (eligibilityModules.value.items.find(one => one.id === moduleId)?.name ?? moduleId)

const eligibility = reactive<Record<ShiftRole, string | null>>({ DUTY_MANAGER: null, DOOR: null, BAR: null })
watch(eligibilitySettings, (settings) => {
  for (const role of SHIFT_ROLES) {
    eligibility[role] = (settings.settings.find(one => one.key === ELIGIBILITY_KEYS[role])?.value as string | null | undefined) ?? null
  }
}, { immediate: true })

const savingEligibility = ref<ShiftRole | null>(null)

async function saveEligibility(role: ShiftRole, next: string | null): Promise<void> {
  const before = eligibility[role]
  eligibility[role] = next
  savingEligibility.value = role
  try {
    await $fetch(`/api/admin/config/${ELIGIBILITY_KEYS[role]}`, { method: 'PUT', body: { value: next } })
    toast.add({ title: 'Shift eligibility saved', icon: 'i-lucide-check', color: 'success' })
    await refreshEligibility()
  }
  catch (error) {
    eligibility[role] = before
    toast.add({ title: refusalText(error), color: 'error' })
  }
  finally {
    savingEligibility.value = null
  }
}

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
    await refresh()
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
    header: ACTIONS_HEADER,
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

    <UPageCard
      v-if="seesEligibility"
      title="Shift eligibility"
      description="A role with a module set here is locked to members who currently hold it; a locked shift on /rota names the module and links to the catalogue. A role left unset is closed to everybody: nobody can claim it until a module is named."
      data-test="shift-eligibility"
    >
      <div class="grid gap-4 sm:grid-cols-3">
        <UFormField
          v-for="role in SHIFT_ROLES"
          :key="role"
          :label="saysShiftRole(role)"
          :description="eligibility[role] ? `Currently ${moduleName(eligibility[role])}.` : 'Closed: nobody can claim this role yet.'"
        >
          <USelectMenu
            :model-value="eligibility[role] ?? undefined"
            :items="moduleOptions"
            value-key="value"
            clearable
            :loading="savingEligibility === role"
            :disabled="!editsEligibility || moduleOptions.length === 0"
            placeholder="No module set"
            class="w-full"
            :data-test="`eligibility-${role}`"
            @update:model-value="value => saveEligibility(role, (value as string | undefined) ?? null)"
          />
        </UFormField>
      </div>
    </UPageCard>

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
          Save it
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
