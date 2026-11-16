<script setup lang="ts">
// Venues with their spaces nested (C-16). Adding a venue adds one space of the same name, so a
// theatre with one room never has to think about spaces.
import { venueInput } from '../../../../../server/places/input'

interface Space { id: string, name: string, defaultCapacity: number | null, archived: boolean }
interface Row { id: string, name: string, locality: string | null, managed: boolean, archived: boolean, spaces: Space[] }

const { $api } = useNuxtApp()
const columns = [
  { key: 'name', label: 'Venue', card: true },
  { key: 'locality', label: 'Town or city', card: true },
  { key: 'spaces', label: 'Spaces', card: true },
]
const filters = [{
  name: 'state',
  label: 'State',
  primary: true,
  options: [{ value: 'active', label: 'In use' }, { value: 'archived', label: 'Archived' }],
}]
const creating = ref(false)
const fields = [
  { name: 'name', label: 'Name', kind: 'text' as const },
  { name: 'locality', label: 'Town or city', kind: 'text' as const, optional: true },
]
const create = (values: Record<string, unknown>) => $api<{ venueId: string }>('/api/core/venues', { method: 'POST', body: values })
const created = (result: unknown) => navigateTo(`/console/programme/venues/${(result as { venueId: string }).venueId}`)

const spaceList = (row: Row) => row.spaces.filter(s => !s.archived)
  .map(s => (s.defaultCapacity ? `${s.name} (${s.defaultCapacity})` : s.name)).join(', ')
</script>

<template>
  <PageList
    title="Venues and spaces"
    route="/api/core/venues"
    :columns="columns"
    :filters="filters"
    :row-label="(row: Row) => row.name"
    :row-to="(row: Row) => `/console/programme/venues/${row.id}`"
    :empty="{ title: 'No venues yet', description: 'A venue is a building or site the theatre performs in. Each has one or more spaces, such as a main house and a studio.', icon: 'i-lucide-building' }"
  >
    <template #primary>
      <UButton
        label="New venue"
        icon="i-lucide-plus"
        @click="creating = true"
      />
    </template>
    <template #cell-name="{ row }">
      <span class="inline-flex items-center gap-2">
        {{ row.name }}
        <UBadge
          v-if="!row.managed"
          label="Visiting"
          color="neutral"
          size="sm"
        />
        <StatusBadge
          v-if="row.archived"
          tone="neutral"
          label="Archived"
        />
      </span>
    </template>
    <template #cell-locality="{ row }">
      {{ row.locality ?? '' }}
    </template>
    <template #cell-spaces="{ row }">
      {{ spaceList(row) }}
    </template>

    <PageForm
      v-model:open="creating"
      title="New venue"
      description="The venue gets one space of the same name. Add more on the venue's page."
      submit-label="Create venue"
      :schema="venueInput"
      :fields="fields"
      :initial="{ name: '', locality: '' }"
      :submit="create"
      @saved="created"
    />
  </PageList>
</template>
