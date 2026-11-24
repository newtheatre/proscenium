<!-- Programme (screen 1): every season the person may plan, newest first. A season with a plan shows
     its state and how much is placed; one without offers "Start a plan" to those who may. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Overview { counts: Record<'candidate' | 'accepted' | 'declined' | 'withdrawn', number>, placed: number, wanted: number }
interface Season { id: string, slug: string, name: string, startsOn: string, endsOn: string, planId: string | null, planState: 'planning' | 'published' | 'closed' | null, mayStart: boolean, overview: Overview | null }

const { t } = useT()
const { span } = useDates()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ seasons: Season[] }>('/api/programme-planning/plans', { key: 'programme-planning:plans' })
const TONES = { planning: 'info', published: 'success', closed: 'neutral' } as const
const starting = ref<string | null>(null)

function describe(s: Season): string {
  const dates = span(s.startsOn, s.endsOn)
  if (!s.overview) return dates
  return [dates, t('programme-planning.plans.placed', { placed: s.overview.placed, wanted: s.overview.wanted }), t('programme-planning.plans.candidates', { count: s.overview.counts.candidate })].join(' · ')
}

async function start(s: Season) {
  starting.value = s.id
  try {
    await $api(`/api/programme-planning/seasons/${s.id}/plan` as string, { method: 'POST', body: {} })
    await navigateTo(`/console/programme/${s.slug}`)
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
    await refresh()
  }
  finally {
    starting.value = null
  }
}
</script>

<template>
  <PageFrame :title="t('programme-planning.navigation.plans.label')">
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="data && !data.seasons.length"
        :title="t('programme-planning.plans.empty.title')"
        :description="t('programme-planning.plans.empty.description')"
        icon="i-lucide-layout-dashboard"
      />
      <RecordList v-else-if="data">
        <RecordListItem
          v-for="s in data.seasons"
          :key="s.id"
          :to="s.planId ? `/console/programme/${s.slug}` : undefined"
          icon="i-lucide-layout-dashboard"
          :name="s.name"
          :description="describe(s)"
          :muted="!s.planId"
        >
          <template #trailing>
            <StatusBadge
              v-if="s.planState"
              :tone="TONES[s.planState]"
              :label="t(`programme-planning.plan.state.${s.planState}`)"
            />
            <UButton
              v-else-if="s.mayStart"
              :label="t('programme-planning.plan.start')"
              :aria-label="t('programme-planning.plan.start-for', { season: s.name })"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="starting === s.id"
              @click="start(s)"
            />
            <span
              v-else
              class="text-sm text-muted"
            >{{ t('programme-planning.plan.not-started') }}</span>
          </template>
        </RecordListItem>
      </RecordList>
    </DataBoundary>
  </PageFrame>
</template>
