<!-- A season's plan (screen 2): before a plan is started, "Start a plan"; after, the entries by
     state, placed against wanted, and the tray: what still wants placing, accepted first (W9). -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

type EntryState = 'candidate' | 'accepted' | 'declined' | 'withdrawn'
interface Plan { id: string, state: 'planning' | 'published' | 'closed', boardFrom: string, boardTo: string, publishedAt: number | null, version: number }
interface Overview { counts: Record<EntryState, number>, placed: number, wanted: number }
interface Page {
  season: { id: string, slug: string, name: string, startsOn: string, endsOn: string }
  plan: Plan | null
  overview: Overview | null
  may: { manage: boolean, viewEntries: boolean, manageEntries: boolean }
}
interface Entry { id: string, title: string, kind: string, state: EntryState, minutes: number | null, performancesWanted: number, placed: number, inTray: boolean }

const { t } = useT()
const { span } = useDates()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const route = useRoute()
const key = computed(() => String(route.params.season))
const { data, status, error, refresh } = await useAPI<Page>(() => `/api/programme-planning/seasons/${encodeURIComponent(key.value)}`, { key: `programme-planning:season:${key.value}` })
const plan = computed(() => data.value?.plan ?? null)
const { data: listed, refresh: refreshEntries } = await useAPI<{ entries: Entry[] }>(() => `/api/programme-planning/plans/${plan.value?.id}/entries`, {
  key: `programme-planning:entries:${key.value}`,
  immediate: !!plan.value && !!data.value?.may.viewEntries,
  watch: false,
})
const tray = computed(() => (listed.value?.entries ?? []).filter(e => e.inTray))
const adding = ref(false)
const bringing = ref(false)
const starting = ref(false)
const TONES = { planning: 'info', published: 'success', closed: 'neutral' } as const

const facts = computed(() => {
  const o = data.value?.overview
  if (!o) return []
  return [
    { label: t('programme-planning.plan.facts.dates'), value: span(plan.value!.boardFrom, plan.value!.boardTo) },
    { label: t('programme-planning.plan.facts.accepted'), value: String(o.counts.accepted) },
    { label: t('programme-planning.plan.facts.candidates'), value: String(o.counts.candidate) },
    { label: t('programme-planning.plan.facts.placed'), value: t('programme-planning.plans.placed', { placed: o.placed, wanted: o.wanted }) },
  ]
})
const actions = computed(() => data.value?.may.manageEntries && plan.value && plan.value.state !== 'closed'
  ? [
      { label: t('programme-planning.entry.add'), icon: 'i-lucide-plus', onSelect: () => { adding.value = true } },
      { label: t('programme-planning.entry.bring'), icon: 'i-lucide-drama', lesser: true, onSelect: () => { bringing.value = true } },
    ]
  : [])

function describe(e: Entry): string {
  return [
    t(`programme-planning.entry.state.${e.state}`),
    e.minutes ? t('programme-planning.entry.length', { count: e.minutes }) : t('programme-planning.entry.no-length'),
    t('programme-planning.plans.placed', { placed: e.placed, wanted: e.performancesWanted }),
  ].join(' · ')
}

async function start() {
  starting.value = true
  try {
    await $api(`/api/programme-planning/seasons/${data.value!.season.id}/plan` as string, { method: 'POST', body: {} })
    await refresh()
    await refreshEntries()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
  finally {
    starting.value = false
  }
}
async function changed() {
  await Promise.all([refresh(), refreshEntries()])
}

useSeoMeta({ title: () => data.value?.season.name ?? t('programme-planning.navigation.plans.label') })
</script>

<template>
  <PageFrame
    :title="data?.season.name ?? t('programme-planning.navigation.plans.label')"
    :trail="[{ label: t('programme-planning.navigation.plans.label'), to: '/console/programme' }]"
  >
    <template
      v-if="plan"
      #status
    >
      <StatusBadge
        :tone="TONES[plan.state]"
        :label="t(`programme-planning.plan.state.${plan.state}`)"
      />
    </template>
    <template
      v-if="actions.length"
      #primary
    >
      <PageActions :actions="actions" />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template v-if="data">
        <EmptyState
          v-if="!plan"
          :title="t('programme-planning.plan.none.title')"
          :description="t('programme-planning.plan.none.description', { season: data.season.name })"
          icon="i-lucide-layout-dashboard"
          :action="data.may.manage ? { label: t('programme-planning.plan.start'), icon: 'i-lucide-plus', onClick: start } : undefined"
        />
        <div
          v-else
          class="space-y-6"
        >
          <FactStrip :facts="facts" />
          <PageSection
            v-if="data.may.viewEntries"
            :title="t('programme-planning.tray.title')"
            :description="t('programme-planning.tray.description')"
          >
            <EmptyState
              v-if="!tray.length"
              :title="t('programme-planning.tray.empty.title')"
              :description="t('programme-planning.tray.empty.description')"
              icon="i-lucide-inbox"
            />
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
        </div>
      </template>
    </DataBoundary>
    <ProgrammePlanningEntryDialog
      v-if="plan"
      v-model:open="adding"
      :plan-id="plan.id"
      @added="changed"
    />
    <ProgrammePlanningBringDialog
      v-if="plan"
      v-model:open="bringing"
      :plan-id="plan.id"
      @added="changed"
    />
  </PageFrame>
</template>
