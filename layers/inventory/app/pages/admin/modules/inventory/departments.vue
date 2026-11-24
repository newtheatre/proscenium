<!-- Kit departments and their categories (S10; INV-05, INV-06). A new site starts from the four
     starting departments; a department or category in use is archived, never deleted (I8). -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Category, Department, StartingDepartment } from '../../../../../shared/setup'

const { t } = useT()
const { data, status, error, refresh } = await useAPI<{ departments: Department[], categories: Category[], kinds: { id: string, name: string }[], starting: StartingDepartment[] }>('/api/inventory/departments', { key: 'inventory:departments' })
const departments = useInventorySetup('/api/inventory/departments', refresh)
const categories = useInventorySetup('/api/inventory/categories', refresh)
const refusal = computed(() => departments.refusal.value ?? categories.refusal.value)

const active = computed(() => (data.value?.departments ?? []).filter(d => d.state === 'active'))
const archived = computed(() => [
  ...(data.value?.departments ?? []).filter(d => d.state === 'archived').map(d => ({ id: d.id, name: d.name, kind: 'department' as const, of: null as string | null })),
  ...(data.value?.categories ?? []).filter(c => c.state === 'archived').map(c => ({ id: c.id, name: c.name, kind: 'category' as const, of: nameOf(c.departmentId) })),
])
const showArchived = ref(false)
const nameOf = (departmentId: string) => data.value?.departments.find(d => d.id === departmentId)?.name ?? null
const categoriesOf = (d: Department) => (data.value?.categories ?? []).filter(c => c.departmentId === d.id && c.state === 'active')
const kindNames = (c: Category) => c.kindIds.map(id => data.value?.kinds.find(k => k.id === id)?.name).filter(Boolean).join(', ')
const describe = (d: Department) => [d.tagPrefix, t(`inventory.departments.lends-to.${d.lendsTo}`), d.contact].filter(Boolean).join(' · ')
const describeCategory = (c: Category) => [kindNames(c) ? t('inventory.categories.needs', { kinds: kindNames(c) }) : null, c.items ? t('inventory.categories.items', { count: c.items }) : null].filter(Boolean).join(' · ')

const departmentOpen = ref(false)
const editingDepartment = ref<Department | null>(null)
const categoryOpen = ref(false)
const editingCategory = ref<Category | null>(null)
const categoryDepartment = ref<Department | null>(null)

function openDepartment(d: Department | null) {
  editingDepartment.value = d
  departmentOpen.value = true
}
function openCategory(d: Department | null, c: Category | null) {
  categoryDepartment.value = d
  editingCategory.value = c
  categoryOpen.value = true
}

const departmentActions = (d: Department): DropdownMenuItem[][] => [
  [
    { label: t('inventory.setup.edit'), icon: 'i-lucide-pencil', onSelect: () => openDepartment(d) },
    { label: t('inventory.categories.add'), icon: 'i-lucide-plus', onSelect: () => openCategory(d, null) },
  ],
  [{ label: t('inventory.setup.archive'), icon: 'i-lucide-archive', color: 'error', onSelect: () => departments.setArchived(d.id, true, t('inventory.setup.archived-toast', { name: d.name })) }],
]
const categoryActions = (d: Department, c: Category): DropdownMenuItem[][] => [
  [{ label: t('inventory.setup.edit'), icon: 'i-lucide-pencil', onSelect: () => openCategory(d, c) }],
  [{ label: t('inventory.setup.archive'), icon: 'i-lucide-archive', color: 'error', onSelect: () => categories.setArchived(c.id, true, t('inventory.setup.archived-toast', { name: c.name })) }],
]
const restore = (row: { id: string, name: string, kind: 'department' | 'category' }) =>
  (row.kind === 'department' ? departments : categories).setArchived(row.id, false, t('inventory.setup.restored', { name: row.name }))
</script>

<template>
  <PageFrame
    :title="t('inventory.navigation.departments.label')"
    :description="t('inventory.departments.description')"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('inventory.departments.add')"
        @click="openDepartment(null)"
      />
    </template>
    <div class="space-y-4">
      <RefusalNotice
        v-if="!departmentOpen && !categoryOpen"
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
            <template v-if="!d.departments.length">
              <EmptyState
                :title="t('inventory.departments.empty.title')"
                :description="t('inventory.departments.empty.description')"
                icon="i-lucide-boxes"
              />
              <PageSection
                :title="t('inventory.departments.starting.title')"
                :description="t('inventory.departments.starting.description')"
              >
                <ul class="space-y-1 text-sm">
                  <li
                    v-for="s in d.starting"
                    :key="s.tagPrefix"
                    class="flex justify-between gap-2"
                  >
                    <span class="text-highlighted">{{ s.name }}</span>
                    <span class="text-muted">{{ s.tagPrefix }} · {{ t(`inventory.departments.lends-to.${s.lendsTo}`) }}</span>
                  </li>
                </ul>
                <template #footer>
                  <UButton
                    color="neutral"
                    variant="outline"
                    :label="t('inventory.departments.starting.use')"
                    loading-auto
                    @click="departments.start(made => t('inventory.departments.started', { count: made }))"
                  />
                </template>
              </PageSection>
            </template>
            <PageSection
              v-for="dep in active"
              :key="dep.id"
              :title="dep.name"
              :description="describe(dep)"
            >
              <template #actions>
                <RowActions
                  :items="departmentActions(dep)"
                  :label="t('inventory.setup.actions-for', { name: dep.name })"
                />
              </template>
              <RecordList
                v-if="categoriesOf(dep).length"
                flush
                :label="t('inventory.categories.of', { department: dep.name })"
              >
                <RecordListItem
                  v-for="c in categoriesOf(dep)"
                  :key="c.id"
                  :name="c.name"
                  :description="describeCategory(c)"
                >
                  <RowActions
                    :items="categoryActions(dep, c)"
                    :label="t('inventory.setup.actions-for', { name: c.name })"
                  />
                </RecordListItem>
              </RecordList>
              <p
                v-else
                class="text-sm text-muted"
              >
                {{ t('inventory.categories.none') }}
              </p>
            </PageSection>
            <CollapsibleDivider
              v-model:open="showArchived"
              :label="t('inventory.setup.archived')"
              :count="archived.length"
            >
              <RecordList :label="t('inventory.setup.archived')">
                <RecordListItem
                  v-for="row in archived"
                  :key="row.id"
                  :name="row.name"
                  :description="row.of ? t('inventory.categories.in', { department: row.of }) : t('inventory.departments.one')"
                  muted
                >
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-archive-restore"
                    :label="t('inventory.setup.restore')"
                    :aria-label="t('inventory.setup.restore-named', { name: row.name })"
                    loading-auto
                    @click="restore(row)"
                  />
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
          </div>
        </template>
      </DataBoundary>
    </div>
    <InventoryDepartmentForm
      v-model:open="departmentOpen"
      :department="editingDepartment"
      @saved="refresh()"
    />
    <InventoryCategoryForm
      v-model:open="categoryOpen"
      :category="editingCategory"
      :department="categoryDepartment"
      :kinds="data?.kinds ?? []"
      @saved="refresh()"
    />
  </PageFrame>
</template>
