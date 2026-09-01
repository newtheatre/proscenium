<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { SPACE_NOTE_REASON_LIMIT, VERDICTS, saysVerdict, spaceForm } from '#shared/utils/external-spaces'
import { describePurpose } from '#shared/utils/bookings'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin', title: 'Other rooms', middleware: 'signed-in' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Note { id: string, purpose: string, verdict: string, reason: string, by: string | null }

interface Space {
  id: string
  name: string
  campus: string | null
  building: string | null
  contact: string | null
  capacity: number | null
  isActive: boolean
  notes: Note[]
}

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const includeRetired = ref(false)
const failure = ref<string | null>(null)

const { data, status, refresh } = await useAsyncData(
  'su-rooms',
  () => request<{ items: Space[], total: number }>('/api/admin/rooms/external-spaces', {
    query: { includeRetired: includeRetired.value },
  }),
  { watch: [includeRetired], default: (): { items: Space[], total: number } => ({ items: [], total: 0 }) },
)

const { data: rules } = await useAsyncData(
  'su-rooms-purposes',
  () => request<{ purposes: string[] }>('/api/rooms/policy'),
  { default: () => ({ purposes: [] as string[] }) },
)

// Searched in the browser: the catalogue an officer edits is tens of rooms, and a round trip to
// filter them would be slower than the typing. The member's picker searches on the server.
const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value.items
  return data.value.items.filter(space => [space.name, space.building ?? '', space.campus ?? '']
    .some(field => field.toLowerCase().includes(term)))
})

const editing = ref<Space | null>(null)
const open = ref(false)
const saving = ref(false)
// The form transforms blanks to null; a UInput wants undefined for the same thing, so the screen
// holds the input shape and the schema does the narrowing on submit.
const state = reactive<{
  name: string
  campus?: string
  building?: string
  contact?: string
  capacity?: number
  isActive: boolean
}>({ name: '', isActive: true })

const noting = ref<Space | null>(null)
const note = reactive({ purpose: '', verdict: 'UNSUITABLE' as (typeof VERDICTS)[number], reason: '' })

function edit(space: Space | null): void {
  editing.value = space
  Object.assign(state, {
    name: space?.name ?? '',
    campus: space?.campus ?? undefined,
    building: space?.building ?? undefined,
    contact: space?.contact ?? undefined,
    capacity: space?.capacity ?? undefined,
    isActive: space?.isActive ?? true,
  })
  open.value = true
}

async function save(event: FormSubmitEvent<SpaceInput>): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    if (editing.value) {
      await $fetch(`/api/admin/rooms/external-spaces/${editing.value.id}`, { method: 'PUT', body: event.data })
    }
    else {
      await $fetch('/api/admin/rooms/external-spaces', { method: 'POST', body: event.data })
    }
    toast.add({ title: editing.value ? 'Room changed' : 'Room listed', icon: 'i-lucide-check', color: 'success' })
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

function startNote(space: Space): void {
  noting.value = space
  Object.assign(note, { purpose: '', verdict: 'UNSUITABLE', reason: '' })
}

async function saveNote(): Promise<void> {
  const space = noting.value
  if (!space) return

  saving.value = true
  try {
    await $fetch(`/api/admin/rooms/external-spaces/${space.id}/notes`, { method: 'PUT', body: { ...note } })
    toast.add({ title: 'Noted', description: 'Anybody asking for that room for that purpose is warned.', icon: 'i-lucide-check', color: 'success' })
    noting.value = null
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    saving.value = false
  }
}

async function forget(space: Space, purpose: string): Promise<void> {
  try {
    await $fetch(`/api/admin/rooms/external-spaces/${space.id}/notes/${purpose}`, { method: 'DELETE' })
    toast.add({ title: 'Note removed', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (error) {
    failure.value = refusalText(error)
  }
}

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (includeRetired.value) {
    active.push({ key: 'retired', label: 'Including retired', icon: 'i-lucide-history', clear: () => {
      includeRetired.value = false
    } })
  }
  return active
})

const purposeOptions = computed(() =>
  rules.value.purposes.map(purpose => ({ label: describePurpose(purpose), value: purpose })))

const columns: TableColumn<Space>[] = [
  {
    id: 'name',
    header: 'Room',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex items-center gap-2' }, [
        h('span', {}, row.original.name),
        row.original.isActive ? null : h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => 'Retired'),
      ]),
      h('div', { class: 'text-xs text-muted' },
        [row.original.building, row.original.campus].filter(Boolean).join(', ') || 'Somewhere on campus'),
    ]),
  },
  {
    id: 'capacity',
    header: 'Holds',
    meta: { class: { td: 'text-sm text-muted whitespace-nowrap' } },
    cell: ({ row }) => (row.original.capacity ? `${row.original.capacity}` : 'Not recorded'),
  },
  {
    id: 'notes',
    header: 'What we know',
    cell: ({ row }) => (row.original.notes.length === 0
      ? h('span', { class: 'text-sm text-muted' }, 'Nothing recorded')
      : h('div', { class: 'space-y-1' }, row.original.notes.map(one =>
          h('div', { class: 'flex flex-wrap items-center gap-2 text-sm' }, [
            h(UBadge, {
              color: one.verdict === 'UNSUITABLE' ? 'error' : one.verdict === 'CAUTION' ? 'warning' : 'success',
              variant: 'subtle',
              size: 'sm',
            }, () => `${saysVerdict(one.verdict)} ${describePurpose(one.purpose).toLowerCase()}`),
            h('span', { class: 'text-muted' }, one.reason),
            h(UButton, {
              'icon': 'i-lucide-x',
              'size': 'xs',
              'color': 'neutral',
              'variant': 'ghost',
              'aria-label': `Forget what we know about ${row.original.name} for ${describePurpose(one.purpose)}`,
              'data-test': `forget-${row.original.id}-${one.purpose}`,
              'onClick': () => forget(row.original, one.purpose),
            }),
          ])))),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      h(UButton, {
        'size': 'sm',
        'variant': 'subtle',
        'data-test': `note-${row.original.id}`,
        'onClick': () => startNote(row.original),
      }, () => 'Note something'),
      h(UButton, {
        'size': 'sm',
        'color': 'neutral',
        'variant': 'ghost',
        'data-test': `edit-space-${row.original.id}`,
        'onClick': () => edit(row.original),
      }, () => 'Edit'),
    ]),
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
      icon="i-lucide-map-pin"
      title="Rooms we do not manage, and cannot promise"
      description="Nothing here holds a slot or appears on a calendar. It is what a member may state a preference for, and what we have learned about each room, so nobody is sent to a meeting room to rehearse in again."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A room, a building or a campus"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; includeRetired = false"
    >
      <template #filters>
        <UFormField label="Show">
          <USwitch
            v-model="includeRetired"
            label="Including retired rooms"
            data-test="spaces-retired"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="add-space"
          icon="i-lucide-plus"
          @click="edit(null)"
        >
          List a room
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="shown"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="spaces-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No SU rooms are listed. Add one and members can ask for it by name.
        </p>
      </template>
    </UTable>

    <p
      data-test="spaces-total"
      class="text-sm text-muted"
    >
      {{ plural(shown.length, 'room') }}
    </p>

    <UModal
      v-model:open="open"
      :title="editing ? `Edit ${editing.name}` : 'List an SU room'"
      description="What we know about where it is and who to ask. We are told little, so most of this is optional."
    >
      <template #body>
        <UForm
          :schema="spaceForm"
          :state="state"
          class="space-y-4"
          data-test="space-form"
          @submit="save"
        >
          <UFormField
            label="Name"
            name="name"
            required
            description="What everybody calls it, so somebody searching finds it."
          >
            <UInput
              v-model="state.name"
              class="w-full"
              data-test="space-name"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Building"
              name="building"
              hint="Optional"
            >
              <UInput
                v-model="state.building"
                class="w-full"
                data-test="space-building"
              />
            </UFormField>
            <UFormField
              label="Campus"
              name="campus"
              hint="Optional"
            >
              <UInput
                v-model="state.campus"
                class="w-full"
              />
            </UFormField>
          </div>

          <UFormField
            label="How many it holds"
            name="capacity"
            hint="Optional"
          >
            <UInputNumber
              v-model="state.capacity"
              :min="1"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Who to ask"
            name="contact"
            hint="Optional"
            description="For an SU room this is usually a desk rather than a person."
          >
            <UInput
              v-model="state.contact"
              class="w-full"
            />
          </UFormField>

          <USwitch
            v-model="state.isActive"
            label="Still worth asking for"
            description="A retired room stays on old requests but is not offered to anybody."
            data-test="space-active"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="space-submit"
            >
              {{ editing ? 'Save it' : 'List it' }}
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              Back
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="noting !== null"
      :title="noting ? `What is ${noting.name} like?` : ''"
      description="Recorded against one purpose. A fixed table ruins a rehearsal and is exactly what a meeting wants, so the same room can be both."
      @update:open="noting = null"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="For what"
            required
            description="One verdict per purpose. Noting it again for the same purpose replaces this one."
          >
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="option in purposeOptions"
                :key="option.value"
                size="sm"
                :color="note.purpose === option.value ? 'primary' : 'neutral'"
                :variant="note.purpose === option.value ? 'solid' : 'outline'"
                :aria-pressed="note.purpose === option.value"
                :data-test="`note-purpose-${option.value}`"
                @click="note.purpose = option.value"
              >
                {{ option.label }}
              </UButton>
            </div>
          </UFormField>

          <UFormField
            label="How it went"
            required
          >
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="verdict in VERDICTS"
                :key="verdict"
                size="sm"
                :color="note.verdict === verdict ? (verdict === 'UNSUITABLE' ? 'error' : verdict === 'CAUTION' ? 'warning' : 'success') : 'neutral'"
                :variant="note.verdict === verdict ? 'solid' : 'outline'"
                :aria-pressed="note.verdict === verdict"
                :data-test="`note-verdict-${verdict}`"
                @click="note.verdict = verdict"
              >
                {{ saysVerdict(verdict) }}
              </UButton>
            </div>
          </UFormField>

          <UFormField
            label="Why"
            required
            :description="`Shown to anybody asking for that room for that purpose. Up to ${SPACE_NOTE_REASON_LIMIT} characters.`"
          >
            <UTextarea
              v-model="note.reason"
              :rows="3"
              :maxlength="SPACE_NOTE_REASON_LIMIT"
              class="w-full"
              data-test="note-reason"
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <UButton
          :loading="saving"
          :disabled="!note.purpose || !note.reason.trim()"
          data-test="note-submit"
          @click="saveNote"
        >
          Note it
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="noting = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
