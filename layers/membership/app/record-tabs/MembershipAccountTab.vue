<!-- The Membership tab on a person's console page (tab 4, core.record-tab): their member number and
     every membership and application of theirs, each opening its own page. -->
<script setup lang="ts">
interface Row { id: string, scheme: string, status: string, startsOn: string | null, endsOn: string | null }

const props = defineProps<{ recordId: string }>()
const { t } = useT()
const { day } = useDates()
const { data, status, error, refresh } = await useAPI<{ number: string | null, memberships: Row[] }>(() => `/api/membership/accounts/${props.recordId}/memberships`, { key: `membership:account:${props.recordId}` })

const label = (s: string) => s === 'pending' ? t('membership.screens.account-tab.pending') : t(`membership.members.status.${s}`)
const dates = (r: Row) => r.startsOn ? (r.endsOn ? t('membership.screens.account-tab.dates', { from: day(r.startsOn), to: day(r.endsOn) }) : t('membership.screens.account-tab.from', { from: day(r.startsOn) })) : undefined
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <div
      v-if="data"
      class="space-y-4"
    >
      <p
        v-if="data.number"
        class="text-sm"
      >
        {{ t('membership.screens.account-tab.number', { number: data.number }) }}
      </p>
      <EmptyState
        v-if="!data.memberships.length"
        :title="t('membership.screens.account-tab.none')"
      />
      <RecordList v-else>
        <RecordListItem
          v-for="m in data.memberships"
          :key="m.id"
          :to="`/console/membership/memberships/${m.id}`"
          :name="m.scheme"
          :description="[label(m.status), dates(m)].filter(Boolean).join(' · ')"
        />
      </RecordList>
    </div>
  </DataBoundary>
</template>
