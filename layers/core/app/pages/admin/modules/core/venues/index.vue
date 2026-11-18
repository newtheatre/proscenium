<script setup lang="ts">
// Venues with their spaces nested (C-16), as card rows like seasons and run presets: a theatre has
// a handful. Adding a venue adds one space of the same name, so a theatre with one room never has
// to think about spaces. Archived venues sit below a divider.
import { venueInput } from '../../../../../../server/places/input'

interface Space { id: string, name: string, defaultCapacity: number | null, managed: boolean, archived: boolean }
interface Row { id: string, name: string, locality: string | null, archived: boolean, spaces: Space[] }

const { $api } = useNuxtApp()
const { data, status, error, refresh } = await useAPI<{ rows: Row[] }>('/api/core/venues', { key: 'core:venues', query: { size: 100, state: 'active' } })
const { data: old, refresh: refreshOld } = await useAPI<{ rows: Row[] }>('/api/core/venues', { key: 'core:venues:archived', query: { size: 100, state: 'archived' } })

const search = ref('')
const searching = ref(false)
const matching = (rows: Row[] | undefined) => {
  const words = search.value.trim().toLowerCase()
  return (rows ?? []).filter(v => !words || v.name.toLowerCase().includes(words) || v.spaces.some(s => s.name.toLowerCase().includes(words)))
}
const current = computed(() => matching(data.value?.rows))
const archived = computed(() => matching(old.value?.rows))
const showArchived = ref(false)
watch(search, (words) => { if (words.trim() && archived.value.length) showArchived.value = true })

const creating = ref(false)
const fields = [
  { name: 'name', label: 'Name', kind: 'text' as const },
  { name: 'locality', label: 'Town or city', kind: 'text' as const, optional: true },
]
const create = (values: Record<string, unknown>) => $api<{ venueId: string }>('/api/core/venues', { method: 'POST', body: values })
// Undo takes a venue made by mistake out of use again; it has no performances yet.
const undoCreate = async (result: unknown) => {
  await $api(`/api/core/venues/${(result as { venueId: string }).venueId}/archive` as string, { method: 'POST', body: {} })
  await Promise.all([refresh(), refreshOld()])
}
const created = (result: unknown) => navigateTo(`/admin/modules/core/venues/${(result as { venueId: string }).venueId}`)

const line = (row: Row) => {
  const spaces = row.spaces.filter(s => !s.archived)
    .map(s => `${s.defaultCapacity ? `${s.name} (${s.defaultCapacity})` : s.name}${s.managed ? '' : ', not run by the theatre'}`).join('; ')
  return [row.locality, spaces].filter(Boolean).join(' · ')
}
</script>

<template>
  <PageFrame
    title="Venues and spaces"
    description="A venue is a building or site the theatre performs in. Each has one or more spaces, such as a main house and a studio."
    width="reading"
  >
    <template #primary>
      <SearchToggle
        v-if="data?.rows.length || old?.rows.length"
        v-model="search"
        v-model:open="searching"
        label="Search venues"
      />
      <UButton
        label="New venue"
        :ui="{ label: searching ? 'max-sm:sr-only' : '' }"
        icon="i-lucide-plus"
        @click="creating = true"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <EmptyState
          v-if="!data?.rows.length && !old?.rows.length"
          title="No venues yet"
          description="A venue is a building or site the theatre performs in. Each has one or more spaces, such as a main house and a studio."
          icon="i-lucide-building"
        />
        <template v-else>
          <p
            v-if="!current.length && !archived.length"
            class="text-sm text-muted"
          >
            No venues match “{{ search.trim() }}”.
          </p>
          <RecordList
            v-if="current.length"
            label="Venues"
          >
            <RecordListItem
              v-for="v in current"
              :key="v.id"
              :name="v.name"
              :description="line(v)"
              :to="`/admin/modules/core/venues/${v.id}`"
            />
          </RecordList>
          <CollapsibleDivider
            v-if="archived.length"
            v-model:open="showArchived"
            label="Archived"
            :count="archived.length"
          >
            <RecordList label="Archived venues">
              <RecordListItem
                v-for="v in archived"
                :key="v.id"
                :name="v.name"
                :description="line(v)"
                :to="`/admin/modules/core/venues/${v.id}`"
                muted
              />
            </RecordList>
          </CollapsibleDivider>
        </template>
      </div>
    </DataBoundary>

    <PageForm
      v-model:open="creating"
      title="New venue"
      description="The venue gets one space of the same name. Add more on the venue's page."
      submit-label="Create venue"
      done="Venue added"
      :undo="undoCreate"
      :schema="venueInput"
      :fields="fields"
      :initial="{ name: '', locality: '' }"
      :submit="create"
      @saved="created"
    />
  </PageFrame>
</template>
