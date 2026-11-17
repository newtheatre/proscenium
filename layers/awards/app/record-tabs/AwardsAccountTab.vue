<!-- The Awards tab on a person's console page: every award of theirs, each opening its own page. -->
<script setup lang="ts">
interface Row { id: string, typeName: string, awardedOn: string, awardedFor: string | null, state: 'current' | 'revoked' }

const props = defineProps<{ recordId: string }>()
const { t } = useT()
const { day } = useDates()
const { data, status, error, refresh } = await useAPI<{ awards: Row[] }>(() => `/api/awards/accounts/${props.recordId}/awards`, { key: `awards:account:${props.recordId}` })
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <EmptyState
      v-if="!data?.awards.length"
      :title="t('awards.screens.account-tab.none')"
    />
    <RecordList v-else>
      <RecordListItem
        v-for="a in data.awards"
        :key="a.id"
        :to="`/console/awards/${a.id}`"
        icon="i-lucide-award"
        :name="a.typeName"
        :description="[day(a.awardedOn), a.awardedFor, a.state === 'revoked' ? t('awards.screens.award-states.revoked') : null].filter(Boolean).join(' · ')"
        :muted="a.state === 'revoked'"
      />
    </RecordList>
  </DataBoundary>
</template>
