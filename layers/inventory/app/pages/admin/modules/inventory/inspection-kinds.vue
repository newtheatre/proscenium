<!-- Inspection kinds (S10; INV-08): recurring checks with an interval, a certificate rule, a
     contractor rule and whether overdue blocks lending (N7). A new site starts from the four in part 6. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Kind, StartingKind } from '../../../../../shared/setup'

const { t } = useT()
const { data, status, error, refresh } = await useAPI<{ kinds: Kind[], starting: StartingKind[] }>('/api/inventory/inspection-kinds', { key: 'inventory:kinds' })
const { refusal, setArchived, start } = useInventorySetup('/api/inventory/inspection-kinds', refresh)
const active = computed(() => (data.value?.kinds ?? []).filter(k => k.state === 'active'))
const archived = computed(() => (data.value?.kinds ?? []).filter(k => k.state === 'archived'))
const showArchived = ref(false)
const open = ref(false)
const editing = ref<Kind | null>(null)

const describe = (k: Pick<Kind, 'intervalDays' | 'certificate' | 'contractorAllowed' | 'blocksWhenOverdue'>) => [
  t('inventory.kinds.every', { count: k.intervalDays }),
  t(`inventory.kinds.certificate.${k.certificate}`),
  k.contractorAllowed ? t('inventory.kinds.contractor-short') : null,
  k.blocksWhenOverdue ? t('inventory.kinds.blocks-short') : null,
].filter(Boolean).join(' · ')

function edit(k: Kind | null) {
  editing.value = k
  open.value = true
}
const actions = (k: Kind): DropdownMenuItem[][] => [
  [{ label: t('inventory.setup.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(k) }],
  [{ label: t('inventory.setup.archive'), icon: 'i-lucide-archive', color: 'error', onSelect: () => setArchived(k.id, true, t('inventory.setup.archived-toast', { name: k.name })) }],
]
</script>

<template>
  <PageFrame
    :title="t('inventory.navigation.inspection-kinds.label')"
    :description="t('inventory.kinds.description')"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('inventory.kinds.add')"
        @click="edit(null)"
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
        <template #default="{ data: d }">
          <div class="space-y-4">
            <template v-if="!d.kinds.length">
              <EmptyState
                :title="t('inventory.kinds.empty.title')"
                :description="t('inventory.kinds.empty.description')"
                icon="i-lucide-clipboard-check"
              />
              <PageSection
                :title="t('inventory.kinds.starting.title')"
                :description="t('inventory.kinds.starting.description')"
              >
                <ul class="space-y-1 text-sm">
                  <li
                    v-for="s in d.starting"
                    :key="s.name"
                    class="flex flex-wrap justify-between gap-2"
                  >
                    <span class="text-highlighted">{{ s.name }}</span>
                    <span class="text-muted">{{ describe(s) }}</span>
                  </li>
                </ul>
                <template #footer>
                  <UButton
                    color="neutral"
                    variant="outline"
                    :label="t('inventory.kinds.starting.use')"
                    loading-auto
                    @click="start(made => t('inventory.kinds.started', { count: made }))"
                  />
                </template>
              </PageSection>
            </template>
            <RecordList
              v-if="active.length"
              :label="t('inventory.navigation.inspection-kinds.label')"
            >
              <RecordListItem
                v-for="k in active"
                :key="k.id"
                :name="k.name"
                :description="describe(k)"
              >
                <RowActions
                  :items="actions(k)"
                  :label="t('inventory.setup.actions-for', { name: k.name })"
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
                  v-for="k in archived"
                  :key="k.id"
                  :name="k.name"
                  :description="describe(k)"
                  muted
                >
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-archive-restore"
                    :label="t('inventory.setup.restore')"
                    :aria-label="t('inventory.setup.restore-named', { name: k.name })"
                    loading-auto
                    @click="setArchived(k.id, false, t('inventory.setup.restored', { name: k.name }))"
                  />
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
          </div>
        </template>
      </DataBoundary>
    </div>
    <InventoryKindForm
      v-model:open="open"
      :kind="editing"
      @saved="refresh()"
    />
  </PageFrame>
</template>
