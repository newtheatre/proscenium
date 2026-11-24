<!-- Items (S1, INV-15): the kit of every department this person may see, narrowed by department,
     category, location, state and "inspection due". Typing or scanning a whole tag opens that item.
     Disposed items sit below the divider. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ItemRow, ItemsList } from '../../../../shared/items'

const { t } = useT()
const { day } = useDates()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { data, status, error, refresh } = await useAPI<ItemsList>('/api/inventory/items', { key: 'inventory:items' })
const { filters, q, departmentItems, categoryItems, locationItems, stateItems, current, disposed, narrowed, exact, isDue } = useItemFilters(data)
const searching = ref(false)
const moving = ref<ItemRow[]>([])
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const canAdd = computed(() => !!data.value?.editable.length)
const actions = computed(() => canAdd.value ? [{ label: t('inventory.items.add'), icon: 'i-lucide-plus', to: '/console/inventory/items/new' }] : [])
const open = (id: string) => navigateTo(`/console/inventory/items/${encodeURIComponent(id)}`)
watch(exact, (item) => { if (item) void open(item.id) })

async function scanned(code: string) {
  refusal.value = null
  try {
    const { itemId } = await $api<{ itemId: string }>(`/api/inventory/items/by-tag/${encodeURIComponent(tagOf(code))}`)
    await open(itemId)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const describe = (i: ItemRow) => [
  i.tracking === 'counted' ? t('inventory.items.quantity', { count: i.quantity }) : null,
  i.category,
  i.location,
  i.nextDueOn ? t(isDue(i) ? 'inventory.items.due-soon' : 'inventory.items.next-due', { date: day(i.nextDueOn) }) : null,
].filter(Boolean).join(' · ')
const rowActions = (i: ItemRow): DropdownMenuItem[][] => [
  [{ label: t('inventory.items.open'), icon: 'i-lucide-arrow-right', onSelect: () => { void open(i.id) } }],
  data.value?.editable.includes(i.departmentId) && i.state !== 'disposed' ? [{ label: t('inventory.items.move'), icon: 'i-lucide-move', onSelect: () => { moving.value = [i] } }] : [],
].filter(group => group.length)
</script>

<template>
  <PageFrame :title="t('inventory.navigation.items.label')">
    <template #primary>
      <SearchToggle
        v-model="q"
        v-model:open="searching"
        :label="t('inventory.items.search')"
      />
      <CodeScanButton
        icon-only
        :label="t('inventory.items.scan')"
        @scanned="scanned"
      />
      <PageActions
        v-if="actions.length"
        :actions="actions"
      />
    </template>
    <template #toolbar>
      <USelectMenu
        v-if="departmentItems.length > 2"
        v-model="filters.departmentId"
        value-key="value"
        :items="departmentItems"
        :aria-label="t('inventory.items.filter-department')"
        class="min-w-40"
      />
      <USelectMenu
        v-model="filters.categoryId"
        value-key="value"
        :items="categoryItems"
        :aria-label="t('inventory.items.filter-category')"
        class="min-w-40"
      />
      <USelectMenu
        v-model="filters.locationId"
        value-key="value"
        :items="locationItems"
        :aria-label="t('inventory.items.filter-location')"
        class="min-w-40"
      />
      <USelect
        v-model="filters.state"
        :items="stateItems"
        :aria-label="t('inventory.items.filter-state')"
        class="min-w-36"
      />
      <UCheckbox
        v-model="filters.due"
        :label="t('inventory.items.filter-due')"
      />
    </template>
    <RefusalNotice :refusal="refusal" />
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!current.length && !disposed.length"
        icon="i-lucide-package"
        :title="t(narrowed ? 'inventory.items.none-found' : 'inventory.items.empty')"
        :description="narrowed ? undefined : t('inventory.items.empty-help')"
      >
        <template
          v-if="!narrowed && canAdd"
          #actions
        >
          <UButton
            to="/console/inventory/items/new"
            :label="t('inventory.items.add')"
          />
          <UButton
            to="/admin/modules/inventory/departments"
            color="neutral"
            variant="outline"
            :label="t('inventory.items.set-up')"
          />
        </template>
      </EmptyState>
      <div
        v-else
        class="space-y-4"
      >
        <RecordList
          v-if="current.length"
          :label="t('inventory.navigation.items.label')"
        >
          <RecordListItem
            v-for="i in current"
            :key="i.id"
            :to="`/console/inventory/items/${i.id}`"
            icon="i-lucide-package"
            :name="`${i.tag} · ${i.name}`"
            :description="describe(i)"
          >
            <template #default>
              <UBadge
                v-if="i.onLoan"
                color="info"
                variant="subtle"
                :label="t('inventory.items.on-loan')"
              />
              <StatusBadge
                v-if="i.state !== 'active'"
                :tone="ITEM_STATE_TONE[i.state]"
                :label="t(`inventory.item-states.${i.state}`)"
              />
            </template>
            <template #trailing>
              <RowActions
                :items="rowActions(i)"
                :label="t('inventory.items.actions-for', { tag: i.tag })"
              />
            </template>
          </RecordListItem>
        </RecordList>
        <CollapsibleDivider
          :label="t('inventory.items.disposed')"
          :count="disposed.length"
        >
          <RecordList :label="t('inventory.items.disposed')">
            <RecordListItem
              v-for="i in disposed"
              :key="i.id"
              :to="`/console/inventory/items/${i.id}`"
              icon="i-lucide-package"
              :name="`${i.tag} · ${i.name}`"
              :description="i.category"
              muted
            />
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>
    <InventoryMoveDialog
      v-model:items="moving"
      @moved="refresh()"
    />
  </PageFrame>
</template>
