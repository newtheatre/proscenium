<!-- The board (screen 3, PP-03): one operating day at a time, spaces across and time down, with the
     tray beside it. The days come fourteen at a time in one read; the tabs pick a day within them and
     Earlier and Later move to the next fourteen. Placing by drag comes with PP-04. -->
<script setup lang="ts">
import type { BoardAnswer } from '../../../../../shared/board'

definePageMeta({ layout: 'console' })

interface Page { season: { id: string, slug: string, name: string }, plan: { id: string } | null, may: { viewEntries: boolean } }
interface Entry { id: string, title: string, state: 'candidate' | 'accepted' | 'declined' | 'withdrawn', minutes: number | null, performancesWanted: number, placed: number, inTray: boolean }

const { t } = useT()
const { dayBrief, dayLong } = useDates()
const route = useRoute()
const router = useRouter()
const key = computed(() => String(route.params.season))
const asked = computed(() => typeof route.query.day === 'string' ? route.query.day : undefined)

const { data: page, status: pageStatus, error: pageError, refresh: refreshPage } = await useAPI<Page>(() => `/api/programme-planning/seasons/${encodeURIComponent(key.value)}`, { key: `programme-planning:season:${key.value}` })
const planId = computed(() => page.value?.plan?.id)
const { data: board, status, error, refresh } = await useAPI<BoardAnswer>(() => `/api/programme-planning/plans/${planId.value}/board`, {
  key: `programme-planning:board:${key.value}:${asked.value ?? ''}`,
  query: computed(() => asked.value ? { day: asked.value } : {}),
  immediate: !!planId.value,
})
const { data: listed } = await useAPI<{ entries: Entry[] }>(() => `/api/programme-planning/plans/${planId.value}/entries`, {
  key: `programme-planning:entries:${key.value}`,
  immediate: !!planId.value && !!page.value?.may.viewEntries,
})
const tray = computed(() => (listed.value?.entries ?? []).filter(e => e.inTray))

const day = computed(() => {
  const days = board.value?.days ?? []
  return days.find(d => d.day === asked.value) ?? days[0] ?? null
})
const tabs = computed(() => (board.value?.days ?? []).map(d => ({ value: d.day, label: dayBrief(d.day) })))
const go = (to: string | null) => { if (to) router.push({ query: { ...route.query, day: to } }) }

const describe = (e: Entry) => [
  t(`programme-planning.entry.state.${e.state}`),
  e.minutes ? t('programme-planning.entry.length', { count: e.minutes }) : t('programme-planning.entry.no-length'),
  t('programme-planning.plans.placed', { placed: e.placed, wanted: e.performancesWanted }),
].join(' · ')

useSeoMeta({ title: () => t('programme-planning.board.title-for', { season: page.value?.season.name ?? '' }) })
</script>

<template>
  <PageFrame
    :title="t('programme-planning.board.title')"
    width="full"
    :trail="[
      { label: t('programme-planning.navigation.plans.label'), to: '/console/programme' },
      ...(page ? [{ label: page.season.name, to: `/console/programme/${page.season.slug}` }] : []),
    ]"
  >
    <DataBoundary
      :data="page"
      :status="pageStatus"
      :error="pageError"
      @retry="refreshPage()"
    >
      <EmptyState
        v-if="page && !page.plan"
        :title="t('programme-planning.plan.none.title')"
        :description="t('programme-planning.plan.none.description', { season: page.season.name })"
        icon="i-lucide-layout-dashboard"
        :action="{ label: t('programme-planning.board.back'), to: `/console/programme/${page.season.slug}` }"
      />
      <div
        v-else
        class="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]"
      >
        <PageSection
          v-if="page?.may.viewEntries"
          :title="t('programme-planning.tray.title')"
          :description="t('programme-planning.tray.description')"
          class="self-start"
        >
          <p
            v-if="!tray.length"
            class="text-sm text-muted"
          >
            {{ t('programme-planning.tray.empty.title') }}
          </p>
          <RecordList
            v-else
            flush
          >
            <RecordListItem
              v-for="e in tray"
              :key="e.id"
              :icon="e.state === 'accepted' ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
              :name="e.title"
              :description="describe(e)"
              :muted="e.state === 'candidate'"
            />
          </RecordList>
        </PageSection>

        <DataBoundary
          :data="board"
          :status="status"
          :error="error"
          @retry="refresh()"
        >
          <div
            v-if="board && day"
            class="space-y-4"
          >
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                :label="t('programme-planning.board.earlier')"
                icon="i-lucide-chevron-left"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="!board.before"
                @click="go(board.before)"
              />
              <TabStrip class="min-w-0 flex-1">
                <UTabs
                  :model-value="day.day"
                  :items="tabs"
                  :content="false"
                  variant="link"
                  :ui="{ list: 'overflow-x-auto overflow-y-hidden [scrollbar-width:none]', trigger: 'shrink-0', label: 'whitespace-nowrap overflow-visible' }"
                  :aria-label="t('programme-planning.board.days')"
                  @update:model-value="v => go(String(v))"
                />
              </TabStrip>
              <UButton
                :label="t('programme-planning.board.later')"
                trailing-icon="i-lucide-chevron-right"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="!board.after"
                @click="go(board.after)"
              />
            </div>
            <h2 class="text-lg font-semibold text-highlighted">
              {{ dayLong(day.day) }}
            </h2>
            <EmptyState
              v-if="!board.spaces.length"
              :title="t('programme-planning.board.no-spaces.title')"
              :description="t('programme-planning.board.no-spaces.description')"
              icon="i-lucide-door-open"
            />
            <ProgrammePlanningDayBoard
              v-else
              :day="day"
              :spaces="board.spaces"
              :occupancy="board.occupancy"
            />
          </div>
        </DataBoundary>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
