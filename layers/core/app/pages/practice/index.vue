<!-- Practice (PM-S1, PM-12): the scenarios this person's training courses open, each a card with its
     summary, how long it takes and one button. The active session's card reads "Carry on", with
     "Start again" beside it; starting another first asks to leave the active one (S2). A scenario that
     cannot start here says why, with no button. An administrator sees every scenario. -->
<script setup lang="ts">
import type { PracticeList } from '../../composables/usePractice'

definePageMeta({ layout: 'live' })

const { t } = useT()
const { time } = useDates()
const { nameOf } = useModuleWords()
const { confirm } = useConfirm()
const { start } = usePracticeActions()
const { data: list, status, refresh } = usePracticeList()
onMounted(() => refresh())

const scenarios = computed(() => list.value?.scenarios ?? [])
const active = computed(() => list.value?.active ?? null)
const labelOf = (id: string) => {
  const s = scenarios.value.find(c => c.id === id)
  return s ? t(s.label) : id
}
const busy = ref<string | null>(null)

function why(blocked: NonNullable<PracticeList['scenarios'][number]['unavailable']>): string {
  return blocked.code === 'core.module.off' ? t('core.practice.unavailable.module', { module: nameOf(blocked.module ?? '') }) : t(`core.practice.unavailable.${blocked.code.split('.').pop()}`)
}

async function begin(id: string, options: { again?: boolean } = {}) {
  const other = active.value && active.value.scenarioId !== id ? active.value.scenarioId : null
  if (other && !(await confirm({
    verb: t('core.practice.list.replace'),
    thing: labelOf(other),
    consequence: t('core.practice.list.replace-consequence'),
    button: t('core.practice.list.replace'),
  }))) return
  busy.value = id
  try {
    await start(id, { ...options, replace: !!other })
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <PageLive :title="t('core.practice.title')">
    <div class="flex flex-col gap-4">
      <UAlert
        v-if="list?.checking"
        color="info"
        variant="subtle"
        icon="i-lucide-shield-check"
        :title="t('core.practice.list.checking')"
      />
      <USkeleton
        v-if="status === 'pending' && !list"
        class="h-32 w-full"
      />
      <EmptyState
        v-else-if="list && !list.enabled"
        icon="i-lucide-graduation-cap"
        :title="t('core.practice.list.off')"
      />
      <EmptyState
        v-else-if="list && !scenarios.length"
        icon="i-lucide-graduation-cap"
        :title="t('core.practice.list.none')"
        :description="t('core.practice.list.none-description')"
        :action="{ label: t('core.practice.list.my-training'), to: '/members/training' }"
      />
      <ul
        v-else
        class="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <li
          v-for="s in scenarios"
          :key="s.id"
        >
          <UCard class="h-full">
            <div class="flex h-full flex-col gap-3">
              <div class="flex flex-col gap-1">
                <h2 class="text-lg font-semibold text-highlighted">
                  {{ t(s.label) }}
                </h2>
                <p class="text-pretty text-muted">
                  {{ t(s.summary) }}
                </p>
                <p class="text-sm text-muted">
                  {{ t('core.practice.list.minutes', { count: s.minutes }) }}
                </p>
              </div>
              <p
                v-if="s.unavailable"
                class="text-warning"
              >
                {{ why(s.unavailable) }}
              </p>
              <div
                v-else-if="active?.scenarioId === s.id"
                class="mt-auto flex flex-wrap items-center gap-2"
              >
                <UButton
                  size="xl"
                  icon="i-lucide-play"
                  :loading="busy === s.id"
                  :label="t('core.practice.list.carry-on')"
                  @click="begin(s.id)"
                />
                <UButton
                  color="neutral"
                  variant="outline"
                  size="xl"
                  icon="i-lucide-rotate-ccw"
                  :disabled="busy !== null"
                  :label="t('core.practice.panel.again')"
                  @click="begin(s.id, { again: true })"
                />
                <span class="text-sm text-muted">{{ t('core.practice.list.started', { time: time(active.startedAt) }) }}</span>
              </div>
              <UButton
                v-else
                size="xl"
                class="mt-auto self-start"
                icon="i-lucide-play"
                :loading="busy === s.id"
                :disabled="busy !== null"
                :label="t('core.practice.list.start')"
                @click="begin(s.id)"
              />
            </div>
          </UCard>
        </li>
      </ul>
    </div>
  </PageLive>
</template>
