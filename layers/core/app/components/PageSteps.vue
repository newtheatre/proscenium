<!-- The Steps page type (UI-17): first run, a module's setup, checkout. Three to five steps, each a
     single decision, with the step names visible throughout. Past five (a built form) the
     indicator says "Page 4 of 9" and names only the current page. Every step can be gone back to
     without losing what was entered; the flow can be left and resumed; the last step is a summary
     of what will happen, with the action named on its button. -->
<script setup lang="ts">
import type { z } from 'zod'

export interface StepDecl {
  id: string
  label: string
  /** What this step's entries must satisfy before Continue. */
  schema?: z.ZodType
}

const props = defineProps<{
  title: string
  /** Names the flow so it can be resumed from this device. */
  flow: string
  steps: StepDecl[]
  /** The last step's button names the act: "Set up the box office". */
  finishLabel: string
  finish: () => Promise<unknown>
  /** Where "Finish later" goes. */
  leaveTo?: string
}>()
/** Everything entered so far, shared by the steps and the summary. */
const state = defineModel<Record<string, any>>('state', { required: true })
const emit = defineEmits<{ done: [result: unknown] }>()

defineSlots<{
  [step: `step-${string}`]: (props: { state: Record<string, any>, errors: Record<string, string> }) => unknown
  summary: (props: { state: Record<string, any> }) => unknown
}>()

const { t } = useT()
const index = ref(0)
const errors = ref<Record<string, string>>({})
const finishing = ref(false)
const failure = ref<ReturnType<typeof toRefusal> | null>(null)

// The last step is always the summary, drawn by the page type rather than by the module.
const total = computed(() => props.steps.length + 1)
const onSummary = computed(() => index.value === props.steps.length)
const current = computed(() => onSummary.value ? { id: 'summary', label: t('core.steps.summary') } : props.steps[index.value]!)
const indicator = computed(() => [...props.steps.map(s => ({ title: s.label })), { title: t('core.steps.summary') }])
const compact = computed(() => total.value > 5) // not-policy: the specification's five steps

onMounted(() => {
  const saved = readProgress(props.flow)
  if (saved) {
    Object.assign(state.value, saved.state)
    index.value = Math.min(saved.index, props.steps.length)
  }
})
const heading = useTemplateRef<HTMLElement>('heading')
watch(index, async () => {
  writeProgress(props.flow, { index: index.value, state: { ...state.value }, at: Date.now() })
  await nextTick()
  heading.value?.focus()
})

function check(): boolean {
  const step = props.steps[index.value]
  errors.value = {}
  if (!step?.schema) return true
  const result = step.schema.safeParse(state.value)
  if (result.success) return true
  for (const issue of result.error.issues) errors.value[String(issue.path[0] ?? '')] ??= issue.message
  return false
}

function next() {
  if (check()) index.value++
}
const back = () => { index.value = Math.max(0, index.value - 1) }

async function done() {
  if (finishing.value) return
  finishing.value = true
  failure.value = null
  try {
    const result = await props.finish()
    writeProgress(props.flow, null)
    emit('done', result)
  }
  catch (error) {
    failure.value = toRefusal(error)
  }
  finally {
    finishing.value = false
  }
}

async function leave() {
  writeProgress(props.flow, { index: index.value, state: { ...state.value }, at: Date.now() })
  await navigateTo(props.leaveTo ?? '/')
}
defineExpose({ errors })
</script>

<template>
  <PageFrame
    :title="title"
    width="reading"
  >
    <nav :aria-label="t('core.steps.progress')">
      <p
        :class="compact ? 'text-sm text-muted' : 'sr-only'"
      >
        {{ t('core.steps.page-of', { page: index + 1, total }) }}
      </p>
      <!-- A picture of progress: the words "Step 2 of 3" and the heading carry it for a screen reader. -->
      <div
        v-if="!compact"
        aria-hidden="true"
      >
        <UStepper
          :model-value="index"
          :items="indicator"
          disabled
          size="sm"
          class="w-full"
        />
      </div>
    </nav>

    <section
      :aria-labelledby="`step-${current.id}`"
    >
      <h2
        :id="`step-${current.id}`"
        ref="heading"
        tabindex="-1"
        class="mb-4 text-lg font-semibold text-highlighted outline-none"
      >
        {{ current.label }}
      </h2>
      <RefusalPanel
        v-if="failure"
        class="mb-4"
        :refusal="failure"
      />
      <UAlert
        v-if="Object.keys(errors).length"
        class="mb-4"
        color="error"
        icon="i-lucide-octagon-alert"
        :title="t('core.form.problems', { count: Object.keys(errors).length })"
        :description="Object.values(errors).join(' ')"
        role="alert"
      />
      <!-- Keyed, so each step is a fresh piece of the page and never the last step's leftovers. -->
      <div :key="current.id">
        <slot
          v-if="onSummary"
          name="summary"
          :state="state"
        />
        <slot
          v-else
          :name="`step-${current.id}`"
          :state="state"
          :errors="errors"
        />
      </div>
    </section>

    <template #footer>
      <UButton
        color="neutral"
        variant="link"
        class="me-auto"
        :label="t('core.steps.later')"
        @click="leave"
      />
      <UButton
        v-if="index > 0"
        color="neutral"
        variant="outline"
        :label="t('core.steps.back')"
        :disabled="finishing"
        @click="back"
      />
      <UButton
        v-if="!onSummary"
        :label="t('core.steps.continue')"
        @click="next"
      />
      <UButton
        v-else
        :label="finishLabel"
        :loading="finishing"
        :disabled="finishing"
        @click="done"
      />
    </template>
  </PageFrame>
</template>
