<!-- Handouts (FH-50): the crew calls whose T-shirts and meals can be handed out now. With one,
     there is nothing to choose, so it opens straight away. -->
<script setup lang="ts">
const { t } = useT()
const dates = useDates()
const { data, status, error, refresh } = await useAPI<{ calls: { id: string, name: string, starts_on: string, ends_on: string }[] }>('/api/front-of-house/handout-calls', { key: 'front-of-house:handout-calls' })
const only = data.value?.calls.length === 1 ? data.value.calls[0] : undefined
if (only) await navigateTo(`/live/front-of-house/handouts/${encodeURIComponent(only.id)}`, { replace: true })
</script>

<template>
  <PageLive :title="t('front-of-house.handouts.title')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="mx-auto max-w-3xl">
          <ul
            v-if="d.calls.length"
            class="space-y-3"
          >
            <li
              v-for="c in d.calls"
              :key="c.id"
            >
              <UButton
                :to="`/live/front-of-house/handouts/${encodeURIComponent(c.id)}`"
                color="neutral"
                variant="outline"
                size="xl"
                block
                trailing-icon="i-lucide-chevron-right"
                class="min-h-16 justify-between text-start"
              >
                <span class="flex flex-col">
                  <span class="text-lg font-semibold">{{ c.name }}</span>
                  <span class="text-sm text-muted">{{ dates.range(c.starts_on, c.ends_on) }}</span>
                </span>
              </UButton>
            </li>
          </ul>
          <EmptyState
            v-else
            icon="i-lucide-shirt"
            :title="t('front-of-house.handouts.none.title')"
            :description="t('front-of-house.handouts.none.description')"
          />
        </div>
      </template>
    </DataBoundary>
  </PageLive>
</template>
