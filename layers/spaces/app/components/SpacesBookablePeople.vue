<!-- Who may decide requests for a room and manage its bookings, and how many may book it (SP-13).
     Nobody to decide is a warning here as well as on the health page: a request would wait until it
     lapsed. Roles are given on the People pages, not here. -->
<script setup lang="ts">
const props = defineProps<{ bookableId: string }>()
const { t } = useT()

interface Person { id: string, name: string }
const { data, status, error, refresh } = await useAPI<{ decide: Person[], manage: Person[], request: number }>(() => `/api/spaces/bookables/${props.bookableId}/people`, { key: `spaces:bookable-people:${props.bookableId}` })
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <div class="max-w-3xl space-y-6">
        <UAlert
          v-if="!d.decide.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('spaces.people.nobody-decides')"
          :description="t('spaces.people.nobody-decides-why')"
        />
        <PageSection
          v-for="group in (['decide', 'manage'] as const)"
          :key="group"
          :title="t(`spaces.people.${group}`)"
        >
          <p
            v-if="!d[group].length"
            class="text-sm text-muted"
          >
            {{ t('spaces.people.nobody') }}
          </p>
          <RecordList
            v-else
            :label="t(`spaces.people.${group}`)"
          >
            <RecordListItem
              v-for="p in d[group]"
              :key="p.id"
              :name="p.name"
            />
          </RecordList>
        </PageSection>
        <p class="text-sm text-muted">
          {{ t('spaces.people.bookers', { count: d.request }) }}
        </p>
      </div>
    </template>
  </DataBoundary>
</template>
