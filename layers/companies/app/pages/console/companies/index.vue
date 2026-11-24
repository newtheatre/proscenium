<script setup lang="ts">
// Companies (part 5): visiting companies, acts and hirers by name, archived ones folded below the
// rest. Search sits by New; a new company starts from its name, with a near match offered (CO-06).
interface CompanyRow { id: string, name: string, archived: boolean, live: number, kinds: string[], primaryContact: string | null, lastDate: number | null }

const { t } = useT()
const { data, status, error, refresh } = await useAPI<{ companies: CompanyRow[], canManage: boolean }>('/api/companies', { key: 'companies:list' })
const { describe } = useCompanyWords()
const { refusal, archive, restore } = useCompanyArchive(refresh)

const search = ref('')
const searching = ref(false)
const matching = computed(() => {
  const words = search.value.trim().toLowerCase()
  return (data.value?.companies ?? []).filter(c => !words || c.name.toLowerCase().includes(words))
})
const current = computed(() => matching.value.filter(c => !c.archived))
const archived = computed(() => matching.value.filter(c => c.archived))
const showArchived = ref(false)
watch(search, (words) => { if (words.trim() && archived.value.length) showArchived.value = true })
const adding = ref(false)

const actions = (c: CompanyRow) => [
  [{ label: t('companies.open'), icon: 'i-lucide-building-2', to: `/console/companies/${c.id}` }],
  ...(data.value?.canManage
    ? [[c.archived
        ? { label: t('companies.restore'), icon: 'i-lucide-archive-restore', onSelect: () => { void restore(c) } }
        : { label: t('companies.archive'), icon: 'i-lucide-archive', disabled: c.live > 0, onSelect: () => { void archive(c) } }]]
    : []),
]
</script>

<template>
  <PageFrame
    :title="t('companies.navigation.companies.label')"
    :description="t('companies.description')"
    width="reading"
  >
    <template #primary>
      <SearchToggle
        v-if="data?.companies.length"
        v-model="search"
        v-model:open="searching"
        :label="t('companies.search')"
      />
      <UButton
        v-if="data?.canManage"
        :label="t('companies.new')"
        :ui="{ label: searching ? 'max-sm:sr-only' : '' }"
        icon="i-lucide-plus"
        @click="adding = true"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <EmptyState
          v-if="!data?.companies.length"
          :title="t('companies.empty.title')"
          :description="t('companies.empty.description')"
          icon="i-lucide-building-2"
        />
        <template v-else>
          <p
            v-if="!matching.length"
            class="text-sm text-muted"
          >
            {{ t('companies.no-match', { search: search.trim() }) }}
          </p>
          <RecordList
            v-if="current.length"
            :label="t('companies.navigation.companies.label')"
          >
            <RecordListItem
              v-for="c in current"
              :key="c.id"
              :to="`/console/companies/${c.id}`"
              :name="c.name"
              :description="describe(c)"
            >
              <RowActions
                :items="actions(c)"
                :label="t('companies.actions', { name: c.name })"
              />
            </RecordListItem>
          </RecordList>
          <CollapsibleDivider
            v-model:open="showArchived"
            :label="t('companies.archived-heading')"
            :count="archived.length"
          >
            <RecordList :label="t('companies.archived-heading')">
              <RecordListItem
                v-for="c in archived"
                :key="c.id"
                :to="`/console/companies/${c.id}`"
                :name="c.name"
                :description="describe(c)"
                muted
              >
                <RowActions
                  :items="actions(c)"
                  :label="t('companies.actions', { name: c.name })"
                />
              </RecordListItem>
            </RecordList>
          </CollapsibleDivider>
        </template>
      </div>
    </DataBoundary>
    <CompaniesNewCompanyDialog v-model:open="adding" />
  </PageFrame>
</template>
