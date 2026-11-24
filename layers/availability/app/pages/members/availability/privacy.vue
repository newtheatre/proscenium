<!-- Who can see my availability (S6, A7): each group I am in and who plans for it, what they see, what
     nobody else ever sees, and how sharing a reason works. -->
<script setup lang="ts">
const { t } = useT()
const { data, status, error, refresh } = await useAPI<{ groups: { id: string, label: string, plannedBy: string | null }[] }>('/api/availability/privacy', { key: 'availability:privacy' })
const SEE = ['levels', 'reasons', 'updated'] as const
const NEVER = ['patterns', 'private-reasons', 'calendar', 'others'] as const
</script>

<template>
  <PageFrame
    :title="t('availability.privacy.title')"
    :description="t('availability.privacy.description')"
    width="reading"
    :trail="[{ label: t('availability.mine.title'), to: '/members/availability' }]"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="space-y-8">
          <PageSection
            :title="t('availability.privacy.groups')"
            :description="t('availability.privacy.groups-help')"
          >
            <EmptyState
              v-if="!d.groups.length"
              icon="i-lucide-users"
              :title="t('availability.privacy.no-groups')"
              :description="t('availability.privacy.no-groups-help')"
            />
            <RecordList
              v-else
              flush
            >
              <RecordListItem
                v-for="g in d.groups"
                :key="g.id"
                icon="i-lucide-users"
                :name="g.label"
                :description="g.plannedBy ?? undefined"
              />
            </RecordList>
          </PageSection>
          <PageSection :title="t('availability.privacy.see')">
            <ul class="list-disc space-y-1 ps-5 text-sm">
              <li
                v-for="k in SEE"
                :key="k"
              >
                {{ t(`availability.privacy.see-${k}`) }}
              </li>
            </ul>
          </PageSection>
          <PageSection :title="t('availability.privacy.never')">
            <ul class="list-disc space-y-1 ps-5 text-sm">
              <li
                v-for="k in NEVER"
                :key="k"
              >
                {{ t(`availability.privacy.never-${k}`) }}
              </li>
            </ul>
          </PageSection>
        </div>
      </template>
    </DataBoundary>
  </PageFrame>
</template>
