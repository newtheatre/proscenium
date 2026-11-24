<!-- The practice frame (PM-S3, PM-10, PM-11): drawn by app.vue round every practice page, so no page
     can leave it out. A banner that cannot be dismissed or scrolled away says the data is not real,
     a straight 4-pixel border in the warning colour marks the whole device, and printed pages say
     "Practice: not valid". Round a live page it also carries the tasks count and the panel, the
     practice card reader and the notice for pages outside the scenario. -->
<script setup lang="ts">
import type { PracticePanelData } from '../composables/usePractice'

const props = defineProps<{
  /** Round a live page, with a session in the store; otherwise the practice list or a start screen. */
  framed: boolean
}>()

const { t } = useT()
// app.vue keys the frame on `framed`, so this is decided once: only a framed page has a store to read.
const { data: panel } = props.framed ? usePracticePanel() : { data: ref<PracticePanelData>() }
const open = ref(false)
const tasks = computed(() => props.framed ? panel.value?.tasks ?? [] : [])
const done = computed(() => tasks.value.filter(task => task.passedAt !== null).length)
// Sticky headers below (PageLive's strip) sit under the banner rather than behind it.
useHead({ htmlAttrs: { style: '--practice-banner: 3.5rem' } })
</script>

<template>
  <div
    role="status"
    class="sticky top-0 z-40 flex h-(--practice-banner) items-center gap-3 bg-warning px-4 text-neutral-950 print:hidden sm:px-6"
  >
    <UIcon
      name="i-lucide-graduation-cap"
      class="size-6 shrink-0"
    />
    <p class="min-w-0 flex-1 truncate">
      <strong class="font-semibold">{{ t('core.practice.banner') }}</strong>
      <span v-if="tasks.length">
        · {{ t('core.practice.tasks-done', { done, total: tasks.length }) }}
      </span>
    </p>
    <UButton
      v-if="framed"
      color="neutral"
      size="xl"
      icon="i-lucide-list-checks"
      :label="t('core.practice.panel.open')"
      @click="open = true"
    />
  </div>
  <div
    aria-hidden="true"
    class="pointer-events-none fixed inset-0 z-50 border-4 border-warning print:hidden"
  />
  <p class="hidden text-center text-lg font-semibold print:block">
    {{ t('core.practice.print') }}
  </p>
  <template v-if="framed && panel">
    <PracticePanel
      v-model:open="open"
      :panel="panel"
    />
    <PracticeCardReader :waiting="panel.waiting[0] ?? null" />
    <PracticeFenced :label="t(panel.scenario.label)" />
  </template>
</template>
