<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { can, manageEmergencyCard } from '#shared/utils/abilities'
import { formatLondon } from '#shared/utils/london'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'console', title: 'Emergency cards', middleware: 'console' })

const UButton = resolveComponent('UButton')

interface VenueCard {
  id: string | null
  venueId: string
  venueName: string
  assemblyPoint: string | null
  exits: string | null
  isolationPoints: string | null
  what3words: string | null
  notes: string | null
  updatedByName: string | null
  updatedAt: number | null
}

const request = useRequestFetch()
const toast = useToast()
const writes = computed(() => can(useViewer().value, manageEmergencyCard))
const search = ref('')
const failure = ref<string | null>(null)
const saving = ref(false)

const { data, status, refresh } = await useAsyncData(
  'emergency-cards',
  () => request<{ venues: VenueCard[] }>('/api/admin/venues/emergency'),
  { default: (): { venues: VenueCard[] } => ({ venues: [] }) },
)

const shown = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return data.value.venues
  return data.value.venues.filter(venue => venue.venueName.toLowerCase().includes(term))
})

interface FormState {
  assemblyPoint: string
  exits: string
  isolationPoints: string
  what3words: string
  notes: string
}

const editing = ref<VenueCard | null>(null)
const open = ref(false)
const state = reactive<FormState>({ assemblyPoint: '', exits: '', isolationPoints: '', what3words: '', notes: '' })

function edit(venue: VenueCard): void {
  editing.value = venue
  Object.assign(state, {
    assemblyPoint: venue.assemblyPoint ?? '',
    exits: venue.exits ?? '',
    isolationPoints: venue.isolationPoints ?? '',
    what3words: venue.what3words ?? '',
    notes: venue.notes ?? '',
  })
  failure.value = null
  open.value = true
}

async function save(): Promise<void> {
  const venue = editing.value
  if (!venue) return
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/venues/${venue.venueId}/emergency`, { method: 'PUT', body: state })
    toast.add({
      title: 'Card saved',
      description: 'A new version, never a rewrite: the last one stays exactly as it was filed.',
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

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  return active
})

function asOf(at: number | null): string {
  return at === null ? 'Never set' : formatLondon(new Date(at * 1000), { dateStyle: 'medium', timeStyle: 'short' })
}

const columns: TableColumn<VenueCard>[] = [
  {
    id: 'venue',
    header: 'Venue',
    cell: ({ row }) => h('span', {}, row.original.venueName),
  },
  {
    id: 'assembly',
    header: 'Assembly point',
    cell: ({ row }) => row.original.assemblyPoint ?? '',
  },
  {
    id: 'asOf',
    header: 'As of',
    cell: ({ row }) => asOf(row.original.updatedAt),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => (writes.value === false
      ? null
      : h(UButton, {
          'size': 'sm', 'color': 'neutral', 'variant': 'ghost',
          'data-test': `edit-emergency-${row.original.venueId}`,
          'onClick': () => edit(row.original),
        }, () => (row.original.id ? 'Edit' : 'Set it up'))),
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
      icon="i-lucide-siren"
      title="Every edit is a new version, never a rewrite"
      description="What front of house reads tonight is whichever version was filed last. Nothing here can lose an earlier one."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A venue"
      :active="activeFilters"
      :loading="status === 'pending'"
      @clear="search = ''"
    />

    <UTable
      :data="shown"
      :columns="columns"
      :loading="status === 'pending'"
      data-test="emergency-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          No venues yet.
        </p>
      </template>
    </UTable>

    <UModal
      v-model:open="open"
      :title="editing ? `Emergency card: ${editing.venueName}` : ''"
      description="Read in the dark, so keep it short and plain."
    >
      <template #body>
        <form
          class="space-y-4"
          data-test="emergency-form"
          @submit.prevent="save"
        >
          <UAlert
            v-if="failure"
            data-test="form-failure"
            color="error"
            variant="subtle"
            :description="failure"
          />

          <UFormField label="Assembly point">
            <UInput
              v-model="state.assemblyPoint"
              class="w-full"
              data-test="field-assembly"
            />
          </UFormField>

          <UFormField label="Exits">
            <UTextarea
              v-model="state.exits"
              :rows="2"
              class="w-full"
              data-test="field-exits"
            />
          </UFormField>

          <UFormField label="Isolation points">
            <UTextarea
              v-model="state.isolationPoints"
              :rows="2"
              class="w-full"
              data-test="field-isolation"
            />
          </UFormField>

          <UFormField
            label="what3words"
            hint="Optional"
          >
            <UInput
              v-model="state.what3words"
              class="w-full"
              data-test="field-w3w"
            />
          </UFormField>

          <UFormField
            label="Notes"
            hint="Optional"
          >
            <UTextarea
              v-model="state.notes"
              :rows="3"
              class="w-full"
              data-test="field-notes"
            />
          </UFormField>

          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              :loading="saving"
              data-test="emergency-submit"
            >
              Save as a new version
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              @click="open = false"
            >
              Back
            </UButton>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
