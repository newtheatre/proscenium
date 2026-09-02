<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { SESSION_CAPACITY_MAX, SESSION_CAPACITY_MIN, saysSessionStatus, sessionForm } from '#shared/utils/training'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { SessionInput } from '#shared/utils/training'

definePageMeta({ layout: 'console', title: 'Training sessions', middleware: 'console' })

const UBadge = resolveComponent('UBadge')

interface Session {
  id: string
  heldOn: string
  startsAt: string
  endsAt: string
  place: string | null
  capacity: number
  opensAt: number | null
  status: string
  trainerName: string
  modules: { id: string, name: string }[]
}

interface Module { id: string, name: string, status: string, signoffRequired: boolean, kind: string }

const request = useRequestFetch()
const toast = useToast()
const search = ref('')
const mine = ref(false)
const failure = ref<string | null>(null)
const saving = ref(false)

const { data, status, refresh } = await useAsyncData(
  'training-sessions',
  () => request<{ items: Session[] }>('/api/admin/training/sessions', { query: { mine: mine.value } }),
  { watch: [mine], default: (): { items: Session[] } => ({ items: [] }) },
)

const { data: catalogue } = await useAsyncData(
  'training-sessions-modules',
  () => request<{ items: Module[] }>('/api/admin/training/modules'),
  { default: () => ({ items: [] as Module[] }) },
)

// What may be taught: active, and not proved by experience rather than by a session (G-112 c3).
const teachable = computed(() => catalogue.value.items.filter(module =>
  module.status === 'ACTIVE' && !module.signoffRequired))

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value.items
  return data.value.items.filter(session =>
    [session.heldOn, session.place ?? '', session.trainerName, ...session.modules.map(m => m.id)]
      .some(field => field.toLowerCase().includes(term)))
})

const open = ref(false)
const state = reactive<{
  heldOn: string
  startsAt: string
  endsAt: string
  place?: string
  capacity: number
  notes?: string
  moduleIds: string[]
}>({ heldOn: '', startsAt: '19:00', endsAt: '21:00', capacity: 20, moduleIds: [] })

function begin(): void {
  Object.assign(state, {
    heldOn: '',
    startsAt: '19:00',
    endsAt: '21:00',
    place: undefined,
    capacity: 20,
    notes: undefined,
    moduleIds: [],
  })
  open.value = true
}

function toggle(id: string): void {
  state.moduleIds = state.moduleIds.includes(id)
    ? state.moduleIds.filter(one => one !== id)
    : [...state.moduleIds, id]
}

async function save(event: FormSubmitEvent<SessionInput>): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    await $fetch('/api/admin/training/sessions', { method: 'POST', body: event.data })
    toast.add({ title: 'Session scheduled', icon: 'i-lucide-check', color: 'success' })
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

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (mine.value) {
    active.push({ key: 'mine', label: 'Mine only', icon: 'i-lucide-user', clear: () => {
      mine.value = false
    } })
  }
  return active
})

const columns: TableColumn<Session>[] = [
  {
    id: 'when',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap' } },
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.heldOn),
      h('div', { class: 'text-xs text-muted' }, `${row.original.startsAt} to ${row.original.endsAt}`),
    ]),
  },
  {
    id: 'teaches',
    header: 'Teaches',
    cell: ({ row }) => h('div', {}, [
      h('div', { class: 'flex flex-wrap gap-1' }, row.original.modules.map(module =>
        h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => module.id))),
      h('div', { class: 'mt-1 text-xs text-muted' },
        `${row.original.trainerName}${row.original.place ? ` · ${row.original.place}` : ''}`),
    ]),
  },
  {
    id: 'capacity',
    header: 'Holds',
    meta: { class: { td: 'text-sm text-muted whitespace-nowrap' } },
    cell: ({ row }) => plural(row.original.capacity, 'place'),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, {
      color: row.original.status === 'OPEN' ? 'success' : row.original.status === 'CANCELLED' ? 'error' : 'neutral',
      variant: 'subtle',
      size: 'sm',
    }, () => saysSessionStatus(row.original.status)),
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
      icon="i-lucide-calendar-days"
      title="Teaching is planned, and running one is earned"
      description="Scheduling a session needs a current trainer certification, and you may teach only what you hold. A certification is not taught by session: it is signed off on experience gained outside training."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A date, a place, a trainer or a module id"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''; mine = false"
    >
      <template #filters>
        <UFormField label="Show">
          <USwitch
            v-model="mine"
            label="Only sessions I am running"
            data-test="sessions-mine"
          />
        </UFormField>
      </template>

      <template #actions>
        <UButton
          data-test="add-session"
          icon="i-lucide-plus"
          :disabled="teachable.length === 0"
          @click="begin"
        >
          Schedule a session
        </UButton>
      </template>
    </AdminToolbar>

    <UTable
      :data="shown"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="sessions-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          Nothing scheduled. A session needs a date, a time, a room's worth of places and something to teach.
        </p>
      </template>
    </UTable>

    <p
      data-test="sessions-total"
      class="text-sm text-muted"
    >
      {{ plural(shown.length, 'session') }}
    </p>

    <UModal
      v-model:open="open"
      title="Schedule a session"
      description="A future day, a London wall clock, and one or more modules you hold. Sign-up opens as soon as it is saved."
    >
      <template #body>
        <UForm
          :schema="sessionForm"
          :state="state"
          class="space-y-4"
          data-test="session-form"
          @submit="save"
        >
          <UFormField
            label="Day"
            name="heldOn"
            required
          >
            <DateField
              v-model="state.heldOn"
              data-test="session-day"
              class="w-full"
            />
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              label="Starts"
              name="startsAt"
              required
            >
              <UInput
                v-model="state.startsAt"
                placeholder="19:00"
                class="w-full"
                data-test="session-starts"
              />
            </UFormField>
            <UFormField
              label="Ends"
              name="endsAt"
              required
            >
              <UInput
                v-model="state.endsAt"
                placeholder="21:00"
                class="w-full"
                data-test="session-ends"
              />
            </UFormField>
          </div>

          <UFormField
            label="Where"
            name="place"
            hint="Optional"
          >
            <UInput
              v-model="state.place"
              class="w-full"
              data-test="session-place"
            />
          </UFormField>

          <UFormField
            label="Places"
            name="capacity"
            required
            :description="`Between ${SESSION_CAPACITY_MIN} and ${SESSION_CAPACITY_MAX}.`"
          >
            <UInputNumber
              v-model="state.capacity"
              :min="SESSION_CAPACITY_MIN"
              :max="SESSION_CAPACITY_MAX"
              class="w-full"
              data-test="session-capacity"
            />
          </UFormField>

          <UFormField
            label="What it teaches"
            name="moduleIds"
            required
            description="You may teach only what you currently hold. Certifications are not taught by session."
          >
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="module in teachable"
                :key="module.id"
                size="sm"
                :color="state.moduleIds.includes(module.id) ? 'primary' : 'neutral'"
                :variant="state.moduleIds.includes(module.id) ? 'solid' : 'outline'"
                :aria-pressed="state.moduleIds.includes(module.id)"
                :data-test="`session-module-${module.id}`"
                @click="toggle(module.id)"
              >
                {{ module.id }}
              </UButton>
            </div>
          </UFormField>

          <UFormField
            label="Notes"
            name="notes"
            hint="Optional"
          >
            <UTextarea
              v-model="state.notes"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="session-submit"
            >
              Schedule it
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
  </div>
</template>
