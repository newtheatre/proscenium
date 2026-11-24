<!-- One item (S2, INV-16; wireframe 1): what it is, where it is, whether it is safe to lend and who
     has it, without a click. Replacement value, owner and serial number only for those who may
     change it (I9). -->
<script setup lang="ts">
import type { ItemPage } from '../../../../../../shared/items'

const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<ItemPage>(() => `/api/inventory/items/${encodeURIComponent(id.value)}`, { key: `inventory:item:${id.value}` })
const { summary, details, dues, history } = useItemPage(data)
const moving = ref<{ id: string, tag: string, homeLocationId: string }[]>([])

const editable = computed(() => !!data.value?.editable && data.value.item.state !== 'disposed')
const primary = computed(() => editable.value ? { label: t('inventory.item.edit'), icon: 'i-lucide-pencil', to: `/console/inventory/items/${id.value}/edit` } : undefined)
const actions = computed(() => [
  [{ label: t('inventory.labels.print-one'), icon: 'i-lucide-qr-code', to: `/console/inventory/labels?items=${encodeURIComponent(id.value)}` }],
  editable.value && data.value ? [{ label: t('inventory.items.move'), icon: 'i-lucide-move', onSelect: () => { moving.value = [data.value!.item] } }] : [],
].filter(group => group.length))
const trail = computed(() => [{ label: t('inventory.navigation.items.label'), to: '/console/inventory' }])
const tabs = computed(() => [
  { id: 'details', label: t('inventory.item.tab.details') },
  { id: 'inspections', label: t('inventory.item.tab.inspections') },
  { id: 'history', label: t('inventory.item.tab.history') },
])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageRecord
        :title="`${d.item.tag} · ${d.item.name}`"
        :status="{ label: t(`inventory.item-states.${d.item.state}`), tone: ITEM_STATE_TONE[d.item.state] }"
        :primary="primary"
        :actions="actions"
        :summary="summary"
        record-type="inventory.item"
        :record-id="d.item.id"
        :tabs="tabs"
        :trail="trail"
      >
        <template #tab-details>
          <div class="max-w-2xl space-y-6">
            <MarkdownText
              v-if="d.item.description"
              :text="d.item.description"
            />
            <FactStrip :facts="details" />
            <PageSection
              v-if="d.item.requirements.length"
              :title="t('inventory.item.training')"
            >
              <ul class="list-inside list-disc text-sm">
                <li
                  v-for="r in d.item.requirements"
                  :key="r"
                >
                  {{ r }}
                </li>
              </ul>
            </PageSection>
            <PageSection
              v-if="d.item.contents.length"
              :title="t('inventory.item.contents')"
            >
              <RecordList :label="t('inventory.item.contents')">
                <RecordListItem
                  v-for="c in d.item.contents"
                  :key="c.id"
                  :to="`/console/inventory/items/${c.id}`"
                  icon="i-lucide-package"
                  :name="`${c.tag} · ${c.name}`"
                />
              </RecordList>
            </PageSection>
          </div>
        </template>
        <template #tab-inspections>
          <EmptyState
            v-if="!dues.length"
            icon="i-lucide-clipboard-check"
            :title="t('inventory.item.no-inspections')"
          />
          <RecordList
            v-else
            :label="t('inventory.item.tab.inspections')"
          >
            <RecordListItem
              v-for="u in dues"
              :key="u.kindId"
              icon="i-lucide-clipboard-check"
              :name="u.kind"
              :muted="!u.applies"
            >
              <StatusBadge
                :tone="u.tone"
                :label="u.when"
              />
            </RecordListItem>
          </RecordList>
        </template>
        <template #tab-history>
          <RecordList :label="t('inventory.item.tab.history')">
            <RecordListItem
              v-for="h in history"
              :key="h.id"
              icon="i-lucide-history"
              :name="h.what"
              :description="[h.detail, h.when].filter(Boolean).join(' · ')"
            />
          </RecordList>
        </template>
      </PageRecord>
      <InventoryMoveDialog
        v-model:items="moving"
        @moved="refresh()"
      />
    </template>
  </DataBoundary>
</template>
