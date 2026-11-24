<!-- Your companies (part 5, CO-08): each engagement of each company the person acts for, as a card with
     its dates and what they owe, oldest deadline first. Settled ones follow. -->
<script setup lang="ts">
const { t } = useT()
const { data, status, error, refresh, toDoWords, datesOf } = await useMyCompanies()
const { stateBadge } = useCompanyWords()
</script>

<template>
  <PageFrame
    :title="t('companies.navigation.mine.label')"
    :description="t('companies.mine.help')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.engagements.length"
        icon="i-lucide-building-2"
        :title="t('companies.mine.nothing-yet')"
        :description="t('companies.mine.nothing-yet-description')"
      />
      <div
        v-else
        class="space-y-6"
      >
        <PageSection
          v-for="e in data.engagements"
          :key="e.id"
          :title="e.title"
          :description="`${e.company} · ${datesOf(e)}`"
        >
          <template #actions>
            <StatusBadge v-bind="stateBadge(e.state)" />
          </template>
          <ul
            v-if="e.toDo.length"
            class="space-y-1 text-sm"
            :aria-label="t('companies.mine.to-do')"
          >
            <li
              v-for="(item, i) in e.toDo"
              :key="i"
              class="flex items-center gap-2"
            >
              <UIcon
                name="i-lucide-circle-alert"
                class="size-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              {{ toDoWords(item) }}
            </li>
          </ul>
          <p
            v-else
            class="text-sm text-muted"
          >
            {{ t('companies.mine.nothing-to-do') }}
          </p>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
