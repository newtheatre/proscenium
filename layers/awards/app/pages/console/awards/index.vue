<!-- Awards: every award the theatre has given, newest first, narrowed by award or by a name.
     Revoked ones sit below a divider. "Issue an award" records one the committee has decided. -->
<script setup lang="ts">
interface Row { id: string, typeId: string, typeName: string, recipientName: string, awardedOn: string, awardedPrecision: 'day' | 'year', awardedFor: string | null, state: 'current' | 'revoked', linked: boolean }
interface AwardType { id: string, name: string, state: string }

const { t } = useT()
const awardDate = useAwardDate()
const typeId = ref<string>('all')
const q = ref('')
const searching = ref(false)
const query = computed(() => ({ type: typeId.value === 'all' ? undefined : typeId.value, q: q.value.trim() || undefined }))
const { data, status, error, refresh } = await useAPI<{ awards: Row[], canIssue: boolean }>('/api/awards/awards', { key: 'awards:list', query, watch: [query] })
const types = await useAPI<{ types: AwardType[] }>('/api/awards/types', { key: 'awards:types' })
const typeItems = computed(() => [{ value: 'all', label: t('awards.screens.awards.all-types') }, ...(types.data.value?.types ?? []).map(x => ({ value: x.id, label: x.name }))])
const current = computed(() => (data.value?.awards ?? []).filter(a => a.state === 'current'))
const revoked = computed(() => (data.value?.awards ?? []).filter(a => a.state === 'revoked'))
const describe = (a: Row) => [a.typeName, awardDate(a), a.awardedFor, a.linked ? null : t('awards.screens.awards.not-linked')].filter(Boolean).join(' · ')
const issuing = ref(false)
const importing = ref(false)
const activeTypes = computed(() => (types.data.value?.types ?? []).filter(x => x.state === 'active'))
</script>

<template>
  <PageFrame :title="t('awards.navigation.awards.label')">
    <template #primary>
      <SearchToggle
        v-model="q"
        v-model:open="searching"
        :label="t('awards.screens.awards.search')"
      />
      <UButton
        v-if="data?.canIssue && activeTypes.length"
        color="neutral"
        variant="outline"
        icon="i-lucide-file-up"
        :label="t('awards.screens.import.action')"
        :ui="{ label: 'max-sm:sr-only' }"
        @click="importing = true"
      />
      <UButton
        v-if="data?.canIssue"
        :label="t('awards.screens.awards.issue')"
        icon="i-lucide-plus"
        :ui="{ label: searching ? 'max-sm:sr-only' : '' }"
        @click="issuing = true"
      />
    </template>
    <template #toolbar>
      <USelect
        v-model="typeId"
        :items="typeItems"
        :aria-label="t('awards.screens.awards.filter-type')"
        class="min-w-48"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.awards.length"
        icon="i-lucide-award"
        :title="t(q || typeId !== 'all' ? 'awards.screens.awards.none-found' : 'awards.screens.awards.empty')"
        :description="q || typeId !== 'all' ? undefined : t('awards.screens.awards.empty-help')"
      />
      <div
        v-else
        class="space-y-4"
      >
        <RecordList
          v-if="current.length"
          :label="t('awards.navigation.awards.label')"
        >
          <RecordListItem
            v-for="a in current"
            :key="a.id"
            :to="`/console/awards/${a.id}`"
            icon="i-lucide-award"
            :name="a.recipientName"
            :description="describe(a)"
          />
        </RecordList>
        <CollapsibleDivider
          :label="t('awards.screens.awards.revoked')"
          :count="revoked.length"
        >
          <RecordList :label="t('awards.screens.awards.revoked')">
            <RecordListItem
              v-for="a in revoked"
              :key="a.id"
              :to="`/console/awards/${a.id}`"
              icon="i-lucide-award"
              :name="a.recipientName"
              :description="describe(a)"
              muted
            />
          </RecordList>
        </CollapsibleDivider>
      </div>
    </DataBoundary>
    <AwardsIssueDialog
      v-model:open="issuing"
      :types="activeTypes"
      :type-id="typeId === 'all' ? undefined : typeId"
      @issued="(id: string) => navigateTo(`/console/awards/${id}`)"
    />
    <AwardsImportDialog
      v-model:open="importing"
      :types="activeTypes"
      :type-id="typeId === 'all' ? undefined : typeId"
      @imported="refresh()"
    />
  </PageFrame>
</template>
