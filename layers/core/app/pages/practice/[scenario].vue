<!-- Starting a practice (PM-S2) and why one ended (PM-S6), at the address a lesson's "Try it in
     practice" opens. Starting makes or resumes the person's store, shows "Setting up a practice
     theatre" meanwhile, and then opens the scenario's live page in its place. A store that has ended
     arrives here with ?ended, and the screen says why and offers to start again. -->
<script setup lang="ts">
import type { RefusalView } from '../../utils/refusal'

definePageMeta({ layout: 'live' })

const { t } = useT()
const route = useRoute()
const { remember, start } = usePracticeActions()
const { data: list, refresh } = usePracticeList()
const id = computed(() => String(route.params.scenario))
const label = computed(() => {
  const s = list.value?.scenarios.find(c => c.id === id.value)
  return s ? t(s.label) : t('core.practice.title')
})
useHead({ title: () => label.value })

type Stage = 'starting' | 'ended' | 'other' | 'unavailable' | 'failed'
const stage = ref<Stage>(route.query.ended ? 'ended' : 'starting')
const refusal = ref<RefusalView | null>(null)
const ENDED = ['left', 'idle', 'night', 'updated', 'switched-off', 'scenario-off']
const ended = computed(() => {
  const reason = list.value?.ended?.reason
  return reason && ENDED.includes(reason) ? reason : 'other'
})

async function begin(options: { again?: boolean, replace?: boolean } = {}) {
  stage.value = 'starting'
  refusal.value = null
  try {
    await start(id.value, options)
  }
  catch (error) {
    refusal.value = toRefusal(error)
    stage.value = refusal.value.code === 'core.practice.other-active' ? 'other' : refusal.value.code === 'core.practice.could-not-start' ? 'failed' : 'unavailable'
  }
}

onMounted(async () => {
  if (route.query.from) remember(route.query.from)
  await refresh()
  if (stage.value === 'starting') await begin()
})
</script>

<template>
  <PageLive
    :title="label"
    back="/practice"
  >
    <div
      v-if="stage === 'starting'"
      role="status"
      class="flex flex-col items-center gap-4 py-16 text-center"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-10 animate-spin text-muted"
      />
      <p class="text-xl font-semibold text-highlighted">
        {{ t('core.practice.starting.title') }}
      </p>
      <p class="text-muted">
        {{ t('core.practice.starting.description') }}
      </p>
    </div>
    <EmptyState
      v-else-if="stage === 'ended'"
      icon="i-lucide-flag"
      :title="t(`core.practice.ended.${ended}`)"
      :description="t('core.practice.ended.description')"
    >
      <template #actions>
        <UButton
          size="xl"
          icon="i-lucide-rotate-ccw"
          :label="t('core.practice.panel.again')"
          @click="begin({ again: true })"
        />
        <UButton
          color="neutral"
          variant="outline"
          size="xl"
          to="/practice"
          :label="t('core.practice.back')"
        />
      </template>
    </EmptyState>
    <EmptyState
      v-else-if="stage === 'other'"
      icon="i-lucide-layers"
      :title="t('core.practice.other.title')"
      :description="t('core.practice.other.description')"
    >
      <template #actions>
        <UButton
          size="xl"
          :label="t('core.practice.list.replace')"
          @click="begin({ replace: true })"
        />
        <UButton
          v-if="list?.active"
          color="neutral"
          variant="outline"
          size="xl"
          :to="`/practice/${encodeURIComponent(list.active.scenarioId)}`"
          :label="t('core.practice.other.carry-on')"
        />
      </template>
    </EmptyState>
    <div
      v-else
      class="flex flex-col gap-4"
    >
      <RefusalPanel
        v-if="refusal"
        :refusal="refusal"
        :sign-in-to="`/sign-in?next=${encodeURIComponent(route.fullPath)}`"
      />
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="stage === 'failed'"
          size="xl"
          icon="i-lucide-rotate-ccw"
          :label="t('core.practice.try-again')"
          @click="begin()"
        />
        <UButton
          color="neutral"
          variant="outline"
          size="xl"
          to="/practice"
          :label="t('core.practice.back')"
        />
      </div>
    </div>
  </PageLive>
</template>
