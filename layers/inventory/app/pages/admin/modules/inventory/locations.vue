<!-- Stores (S10; INV-07): where kit is kept, as a tree of stores, rooms, rails and shelves, each
     optionally in a venue or space. A location holding items or other places stays (I8). -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { LOCATION_DEPTH, type Location } from '../../../../../shared/setup'
import { locationTree, type TreeRow } from '../../../../utils/location-tree'

interface Venue { id: string, name: string, spaces: { id: string, name: string }[] }
const { t } = useT()
const { data, status, error, refresh } = await useAPI<{ locations: Location[], venues: Venue[] }>('/api/inventory/locations', { key: 'inventory:locations' })
const { refusal, setArchived } = useInventorySetup('/api/inventory/locations', refresh)
const tree = computed(() => locationTree(data.value?.locations ?? []))
const active = computed(() => tree.value.filter(r => r.location.state === 'active'))
const archived = computed(() => tree.value.filter(r => r.location.state === 'archived'))
const showArchived = ref(false)
const open = ref(false)
const editing = ref<Location | null>(null)
const inside = ref<string | null>(null)

const placeOf = (l: Location) => {
  const venue = data.value?.venues.find(v => v.id === l.venueId)
  const space = venue?.spaces.find(s => s.id === l.spaceId)
  return [space?.name, venue?.name].filter(Boolean).join(', ')
}
const describe = (r: TreeRow) => [placeOf(r.location), r.location.items ? t('inventory.locations.items', { count: r.location.items }) : null].filter(Boolean).join(' · ')

function add(parentId: string | null) {
  editing.value = null
  inside.value = parentId
  open.value = true
}
function edit(l: Location) {
  editing.value = l
  open.value = true
}
const actions = (r: TreeRow): DropdownMenuItem[][] => [
  [
    { label: t('inventory.setup.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(r.location) },
    ...(r.depth < LOCATION_DEPTH ? [{ label: t('inventory.locations.add-inside'), icon: 'i-lucide-plus', onSelect: () => add(r.location.id) }] : []),
  ],
  [{ label: t('inventory.setup.archive'), icon: 'i-lucide-archive', color: 'error', onSelect: () => setArchived(r.location.id, true, t('inventory.setup.archived-toast', { name: r.location.name })) }],
]
</script>

<template>
  <PageFrame
    :title="t('inventory.navigation.locations.label')"
    :description="t('inventory.locations.description')"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('inventory.locations.add')"
        @click="add(null)"
      />
    </template>
    <div class="space-y-4">
      <RefusalNotice
        v-if="!open"
        :refusal="refusal"
      />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default>
          <div class="space-y-4">
            <EmptyState
              v-if="!tree.length"
              :title="t('inventory.locations.empty.title')"
              :description="t('inventory.locations.empty.description')"
              icon="i-lucide-warehouse"
            />
            <RecordList
              v-if="active.length"
              :label="t('inventory.navigation.locations.label')"
            >
              <RecordListItem
                v-for="r in active"
                :key="r.location.id"
                :name="r.location.name"
                :description="describe(r)"
                :label="r.path"
                :style="{ paddingInlineStart: `${(r.depth - 1) * 1.5}rem` }"
              >
                <RowActions
                  :items="actions(r)"
                  :label="t('inventory.setup.actions-for', { name: r.path })"
                />
              </RecordListItem>
            </RecordList>
            <CollapsibleDivider
              v-model:open="showArchived"
              :label="t('inventory.setup.archived')"
              :count="archived.length"
            >
              <RecordList :label="t('inventory.setup.archived')">
                <RecordListItem
                  v-for="r in archived"
                  :key="r.location.id"
                  :name="r.path"
                  muted
                >
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-archive-restore"
                    :label="t('inventory.setup.restore')"
                    :aria-label="t('inventory.setup.restore-named', { name: r.path })"
                    loading-auto
                    @click="setArchived(r.location.id, false, t('inventory.setup.restored', { name: r.location.name }))"
                  />
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
          </div>
        </template>
      </DataBoundary>
    </div>
    <InventoryLocationForm
      v-model:open="open"
      :location="editing"
      :parent-id="inside"
      :tree="tree"
      :venues="data?.venues ?? []"
      @saved="refresh()"
    />
  </PageFrame>
</template>
