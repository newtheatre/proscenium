<!-- M3's Steps tab (amended part 5): each step with the person's progress and its own action by kind.
     Reading is opened and confirmed here; certificates and declarations open their panel. -->
<script setup lang="ts">
import type { MyStep, StepAction } from '../../server/learner'
import type { EvidenceStep } from '../composables/useEvidenceForm'

const props = defineProps<{ courseId: string, steps: MyStep[], sessions: number }>()
const emit = defineEmits<{ sessions: [], evidence: [step: EvidenceStep], changed: [] }>()
const { t } = useT()
const { dateTime } = useDates()
const act = useTrainingAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const path = (step: MyStep, what: string) => `/api/training/courses/${encodeURIComponent(props.courseId)}/steps/${encodeURIComponent(step.id)}/${what}`

// The material opens in a new tab at once; the server is told it was opened as it goes (TR-08).
function opened(step: MyStep) {
  act(path(step, 'opened'), { method: 'POST', body: {} }).catch(() => {})
}
async function confirmReading(step: MyStep) {
  refusal.value = null
  try {
    await act(path(step, 'read'), { method: 'POST', body: {} })
    toast.add({ title: t('training.steps.read-done'), color: 'success' })
    emit('changed')
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

type Action<K extends StepAction['kind']> = Extract<StepAction, { kind: K }>
const evidenceLine = (a: Action<'certificate' | 'declaration'>) => a.lastReason ? t('training.steps.not-approved', { reason: a.lastReason }) : undefined
/** What happens next on an unfinished step, one line per kind. */
const NEXT: { [K in StepAction['kind']]: (a: Action<K>) => string | undefined } = {
  session: a => a.place ? t('training.steps.place', { state: t(`training.place-states.${a.place.state}`), when: dateTime(a.place.startsAt) }) : props.sessions ? undefined : t('training.steps.no-sessions'),
  trainer: () => t('training.steps.trainer'),
  reading: () => undefined,
  lesson: a => a.reached ? t('training.steps.sections', { reached: a.reached, sections: a.sections }) : t('training.steps.lesson'),
  quiz: a => a.nextTryAt ? t('training.steps.try-from', { when: dateTime(a.nextTryAt) }) : a.tries ? t('training.steps.tries', { used: a.used, tries: a.tries }) : t('training.steps.quiz'),
  certificate: evidenceLine,
  declaration: evidenceLine,
  activity: a => a.source ?? undefined,
}

/** The line under a step's title: how far the person is, or what happens next. */
function progress(step: MyStep): string | undefined {
  if (step.met) return undefined
  if (step.needed > 1) return t('training.steps.times', { done: step.done, needed: step.needed })
  return (NEXT[step.action.kind] as (a: StepAction) => string | undefined)(step.action)
}
const evidence = (step: MyStep) => step.action.kind === 'certificate' || step.action.kind === 'declaration' ? { id: step.id, title: step.title, action: step.action } : null
</script>

<template>
  <div class="space-y-3">
    <RefusalNotice :refusal="refusal" />
    <RecordList :label="t('training.course.steps')">
      <RecordListItem
        v-for="s in steps"
        :key="s.id"
        :icon="s.met ? 'i-lucide-circle-check' : 'i-lucide-circle'"
        :name="s.title"
        :description="progress(s)"
      >
        <StatusBadge
          v-if="s.met"
          tone="success"
          :label="t('training.steps.done')"
        />
        <template v-else-if="s.action.kind === 'session' && s.action.place">
          <UButton
            color="neutral"
            variant="outline"
            :label="t('training.steps.view-place')"
            :to="`/members/training/sessions/${encodeURIComponent(s.action.place.sessionId)}`"
          />
        </template>
        <template v-else-if="s.action.kind === 'session' && sessions">
          <UButton
            color="neutral"
            variant="outline"
            :label="t('training.steps.sign-up')"
            @click="emit('sessions')"
          />
        </template>
        <template v-else-if="s.action.kind === 'reading'">
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="s.action.materialUrl"
              color="neutral"
              variant="outline"
              icon="i-lucide-external-link"
              :href="s.action.materialUrl"
              target="_blank"
              rel="noopener"
              :label="t('training.steps.open-reading')"
              @click="opened(s)"
            />
            <UButton
              color="neutral"
              variant="outline"
              :label="t('training.steps.confirm-reading')"
              loading-auto
              @click="confirmReading(s)"
            />
          </div>
        </template>
        <StatusBadge
          v-else-if="evidence(s)?.action.waiting"
          tone="info"
          :label="t('training.steps.waiting')"
        />
        <UButton
          v-else-if="evidence(s) && !(evidence(s)!.action.kind === 'declaration' && evidence(s)!.action.hasQuestions)"
          color="neutral"
          variant="outline"
          :label="t(s.action.kind === 'certificate' ? 'training.steps.send-certificate' : 'training.steps.declare')"
          @click="emit('evidence', evidence(s)!)"
        />
        <template #below>
          <p
            v-if="s.guidance && !s.met"
            class="text-sm text-muted whitespace-pre-line"
          >
            {{ s.guidance }}
          </p>
        </template>
      </RecordListItem>
    </RecordList>
  </div>
</template>
