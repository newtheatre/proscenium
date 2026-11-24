<script setup lang="ts">
// Venues with their spaces nested (C-16), as card rows like seasons and run presets: a theatre has
// a handful. Adding a venue adds one space of the same name, so a theatre with one room never has
// to think about spaces. Archived venues sit below a divider.
import { venueInput } from '../../../../../../server/places/input'

interface Space { id: string, name: string, defaultCapacity: number | null, managed: boolean, archived: boolean }
interface Row { id: string, name: string, locality: string | null, archived: boolean, spaces: Space[] }

const { t } = useT()
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
  { name: 'name', label: t('core.venues.name'), kind: 'text' as const },
  { name: 'locality', label: t('core.venues.town-or-city'), kind: 'text' as const, optional: true },
]
const create = (values: Record<string, unknown>) => $api<{ venueId: string }>('/api/core/venues', { method: 'POST', body: values })
// Undo takes a venue made by mistake out of use again; it has no performances yet.
const undoCreate = async (result: unknown) => {
  await $api(`/api/core/venues/${(result as { venueId: string }).venueId}/archive` as string, { method: 'POST', body: {} })
  await Promise.all([refresh(), refreshOld()])
}
const created = (result: unknown) => navigateTo(`/admin/modules/core/venues/${(result as { venueId: string }).venueId}`)
// The palette's New venue arrives with ?new=1.
const route = useRoute()
onMounted(() => {
  if (route.query.new !== '1') return
  creating.value = true
  const { new: _, ...rest } = route.query
  void navigateTo({ query: rest }, { replace: true })
})

const line = (row: Row) => {
  const spaces = row.spaces.filter(s => !s.archived)
    .map(s => `${s.defaultCapacity ? `${s.name} (${s.defaultCapacity})` : s.name}${s.managed ? '' : t('core.venues.not-ours')}`).join('; ')
  return [row.locality, spaces].filter(Boolean).join(' · ')
}
</script>

<template>
  <PageFrame
    :title="t('core.venues.venues-and-spaces')"
    :description="t('core.venues.description-a-venue-is')"
    width="reading"
  >
    <template #primary>
      <SearchToggle
        v-if="data?.rows.length || old?.rows.length"
        v-model="search"
        v-model:open="searching"
        :label="t('core.venues.search-venues')"
      />
      <UButton
        :label="t('core.venues.new-venue')"
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
          :title="t('core.venues.no-venues-yet')"
          :description="t('core.venues.description-a-venue-is')"
          icon="i-lucide-building"
        />
        <template v-else>
          <p
            v-if="!current.length && !archived.length"
            class="text-sm text-muted"
          >
            {{ t('core.venues.no-match', { search: search.trim() }) }}
          </p>
          <RecordList
            v-if="current.length"
            :label="t('core.venues.venues')"
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
            :label="t('core.states.archived')"
            :count="archived.length"
          >
            <RecordList :label="t('core.venues.archived-venues')">
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
      :title="t('core.venues.new-venue')"
      :description="t('core.venues.description-the-venue-gets')"
      :submit-label="t('core.venues.create-venue')"
      :done="t('core.venues.added')"
      :undo="undoCreate"
      :schema="venueInput"
      :fields="fields"
      :initial="{ name: '', locality: '' }"
      :submit="create"
      @saved="created"
    />
  </PageFrame>
</template>
