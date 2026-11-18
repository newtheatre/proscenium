<!-- A form as a respondent fills it in, page by page, driven by the one engine: what is shown, what
     is required, what is wrong, where Continue goes and where the form ends. In the builder it is
     the preview and keeps nothing (FB-205); on a form's own page `send` stores the answers, and
     the form only says it has been sent once that has worked (FB-302). -->
<script setup lang="ts">
import { evaluate, issuesOnPage, nextStep, otherKey, type Answers, type Context, type Definition, type Ending, type Entry, type Group, type Question, type Value } from '../../shared/engine'

const props = defineProps<{
  definition: Definition
  context: Context
  sendLabel?: string
  /** Stores the answers. Resolves false when it could not, and the person stays where they are. */
  send?: (answers: Answers) => Promise<boolean>
  /** Something the page asks beside the form, checked with every Continue. False keeps the person where they are. */
  check?: () => boolean
  /** The page to open on, for someone coming back to answers they had started. */
  start?: string | null
}>()
const emit = defineEmits<{ submit: [answers: Answers], page: [id: string] }>()
const answers = defineModel<Answers>({ default: () => ({}) })
const { t } = useT()

const evaluation = computed(() => evaluate(props.definition, answers.value, props.context))
const pageId = ref(props.start && props.definition.pages.some(p => p.id === props.start) ? props.start : props.definition.pages[0]!.id)
// Answers kept from an earlier visit arrive once the page is in the browser, with the page they were on.
watch(() => props.start, (id) => { if (id && id !== pageId.value && props.definition.pages.some(p => p.id === id)) pageId.value = id })
const sending = ref(false)
const checked = ref(false)
const ended = ref<Ending | 'sent' | null>(null)
// An edit in the builder can remove the open page, or the route can stop passing through it.
watchEffect(() => {
  if (!evaluation.value.route.includes(pageId.value)) pageId.value = evaluation.value.route[0] ?? props.definition.pages[0]!.id
})
const page = computed(() => props.definition.pages.find(p => p.id === pageId.value)!)
const at = computed(() => evaluation.value.route.indexOf(pageId.value))
const issues = computed(() => checked.value ? issuesOnPage(props.definition, evaluation.value, pageId.value) : {})
const last = computed(() => !('page' in nextStep(evaluation.value, pageId.value)))
const top = useTemplateRef<HTMLElement>('top')

async function go(to: () => void) {
  to()
  checked.value = false
  await nextTick()
  top.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
/** Sends, where this is a real form. False means it was not stored, so nothing may say it was. */
async function deliver(): Promise<boolean> {
  emit('submit', evaluation.value.answers)
  if (!props.send) return true
  sending.value = true
  try {
    return await props.send(evaluation.value.answers)
  }
  finally {
    sending.value = false
  }
}
async function next() {
  if (sending.value) return
  // What the page asks beside the form is checked in the same pass as this page's answers, and keeps the focus it took.
  const beside = props.check?.() ?? true
  if (Object.keys(issuesOnPage(props.definition, evaluation.value, pageId.value)).length) {
    checked.value = true
    // The first answer that needs attention takes the focus.
    await nextTick()
    if (beside) top.value?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid] input, [data-invalid] textarea, [data-invalid] button')?.focus()
    return
  }
  if (!beside) return
  const step = nextStep(evaluation.value, pageId.value)
  if ('page' in step) return go(() => { pageId.value = step.page })
  if ('ending' in step) {
    if (step.ending.submits && !await deliver()) return
    return go(() => { ended.value = step.ending })
  }
  if (await deliver()) go(() => { ended.value = 'sent' })
}
watch(pageId, id => emit('page', id))
const labelOf = (path: string): string => {
  const id = path.split('.').pop()!
  for (const p of props.definition.pages) {
    for (const item of p.items) {
      if (item.id === path && item.kind === 'group') return item.label
      const found = (item.kind === 'question' ? [item] : item.kind === 'row' || item.kind === 'group' ? item.items : []).find(q => q.id === id)
      if (found) return found.label
    }
  }
  return path
}
const back = () => go(() => { pageId.value = evaluation.value.route[at.value - 1]! })
function restart() {
  answers.value = {}
  ended.value = null
  pageId.value = props.definition.pages[0]!.id
  checked.value = false
}
defineExpose({ restart })

const set = (id: string, value: Value | Entry[]) => { answers.value = { ...answers.value, [id]: value } }
const entries = (g: Group) => (Array.isArray(answers.value[g.id]) ? answers.value[g.id] : []) as Entry[]
const setEntry = (g: Group, i: number, key: string, value: Value) => set(g.id, entries(g).map((e, j) => j === i ? { ...e, [key]: value } : e))
const otherOf = (from: Record<string, unknown>, id: string) => {
  const text = from[otherKey(id)]
  return typeof text === 'string' ? text : undefined
}
const visible = (path: string) => evaluation.value.visible[path] !== false
const calculated = computed(() => (props.definition.calculations ?? []).map(c => ({ key: c.key, value: evaluation.value.calculated[c.id] })).filter(c => c.value !== null && c.value !== undefined))
const questionsOf = (item: Definition['pages'][number]['items'][number]): Question[] => item.kind === 'question' ? [item] : item.kind === 'row' ? item.items : []
</script>

<template>
  <div
    ref="top"
    class="scroll-mt-24 space-y-6"
  >
    <div
      v-if="ended"
      key="ended"
      class="space-y-2 text-center"
    >
      <div class="contents">
        <UIcon
          :name="ended === 'sent' || ended.submits ? 'i-lucide-circle-check' : 'i-lucide-circle-slash'"
          class="size-8 text-primary"
        />
        <h2 class="text-lg font-semibold">
          {{ ended === 'sent' ? t('forms.screens.fill.sent') : ended.title || t('forms.screens.builder.untitled-ending') }}
        </h2>
        <MarkdownText
          v-if="ended === 'sent' ? definition.presentation?.confirmation : ended.message"
          :text="ended === 'sent' ? definition.presentation?.confirmation : ended.message"
        />
        <slot
          name="ended"
          :ending="ended"
        />
      </div>
    </div>
    <div
      v-else
      key="asking"
      class="space-y-6"
    >
      <MarkdownText
        v-if="at === 0 && definition.presentation?.introduction"
        :text="definition.presentation.introduction"
      />
      <div v-if="evaluation.route.length > 1 || page.title || definition.pages.length > 1 || page.help">
        <p
          v-if="evaluation.route.length > 1"
          class="text-sm text-muted"
        >
          {{ t('forms.screens.fill.step', { n: at + 1, count: evaluation.route.length }) }}
        </p>
        <h2
          v-if="page.title || definition.pages.length > 1"
          class="text-lg font-semibold"
        >
          {{ page.title || t('forms.screens.builder.page-n', { n: definition.pages.indexOf(page) + 1 }) }}
        </h2>
        <p
          v-if="page.help"
          class="text-muted"
        >
          {{ page.help }}
        </p>
      </div>
      <UAlert
        v-if="checked && Object.keys(issues).length"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="t('forms.screens.fill.fix', { count: Object.keys(issues).length })"
      >
        <template #description>
          <ul class="list-disc ps-5">
            <li
              v-for="path in Object.keys(issues)"
              :key="path"
            >
              <a
                :href="`#answer-${path}`"
                class="underline"
              >{{ labelOf(path) }}</a>
            </li>
          </ul>
        </template>
      </UAlert>
      <template
        v-for="item in page.items"
        :key="item.id"
      >
        <MarkdownText
          v-if="item.kind === 'content' && visible(item.id)"
          :text="item.text"
        />
        <div
          v-else-if="item.kind === 'question' || item.kind === 'row'"
          :class="item.kind === 'row' ? 'grid gap-6 sm:grid-cols-2' : ''"
        >
          <template
            v-for="q in questionsOf(item)"
            :key="q.id"
          >
            <FormsFillQuestion
              v-if="visible(q.id)"
              :id="`answer-${q.id}`"
              class="scroll-mt-4"
              :question="q"
              :required="evaluation.required[q.id] === true"
              :issues="issues[q.id]"
              :model-value="answers[q.id] as Value"
              :other="otherOf(answers, q.id)"
              @update:model-value="set(q.id, $event)"
              @update:other="set(otherKey(q.id), $event || undefined)"
            />
          </template>
        </div>
        <fieldset
          v-else-if="item.kind === 'group' && visible(item.id)"
          :id="`answer-${item.id}`"
          class="scroll-mt-4 space-y-3"
        >
          <legend
            class="font-medium"
            :class="(item.min ?? 0) > 0 ? `after:ms-0.5 after:text-error after:content-['*']` : ''"
          >
            {{ item.label }}
          </legend>
          <p
            v-if="item.help"
            class="text-sm text-muted"
          >
            {{ item.help }}
          </p>
          <p
            v-if="issues[item.id]"
            class="text-sm text-error"
          >
            {{ t(`forms.issues.${issues[item.id]![0]!.rule}`, issues[item.id]![0]!.params ?? {}) }}
          </p>
          <div
            v-for="(entry, i) in entries(item)"
            :key="i"
            class="space-y-4 rounded-lg border border-default p-4"
          >
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium text-muted">
                {{ t('forms.screens.fill.entry', { n: i + 1 }) }}
              </p>
              <IconButton
                icon="i-lucide-trash-2"
                size="sm"
                :label="t('forms.screens.fill.remove-entry', { n: i + 1 })"
                @click="set(item.id, entries(item).filter((_, j) => j !== i))"
              />
            </div>
            <template
              v-for="q in item.items"
              :key="q.id"
            >
              <FormsFillQuestion
                v-if="visible(`${item.id}.${i}.${q.id}`)"
                :id="`answer-${item.id}.${i}.${q.id}`"
                class="scroll-mt-4"
                :question="q"
                :required="evaluation.required[`${item.id}.${i}.${q.id}`] === true"
                :issues="issues[`${item.id}.${i}.${q.id}`]"
                :model-value="entry[q.id]"
                :other="otherOf(entry, q.id)"
                @update:model-value="setEntry(item, i, q.id, $event)"
                @update:other="setEntry(item, i, otherKey(q.id), $event || undefined)"
              />
            </template>
          </div>
          <UButton
            v-if="item.max === undefined || entries(item).length < item.max"
            :label="t('forms.screens.fill.add-entry')"
            icon="i-lucide-plus"
            color="neutral"
            variant="subtle"
            @click="set(item.id, [...entries(item), {}])"
          />
        </fieldset>
      </template>
      <dl
        v-if="calculated.length"
        class="rounded-lg bg-elevated/50 p-3 text-sm"
      >
        <div
          v-for="c in calculated"
          :key="c.key"
          class="flex justify-between gap-4"
        >
          <dt class="font-mono text-muted">
            {{ c.key }}
          </dt>
          <dd class="tabular-nums">
            {{ c.value }}
          </dd>
        </div>
      </dl>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <UButton
          v-if="at > 0"
          class="justify-center"
          :label="t('forms.screens.fill.back')"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          @click="back"
        />
        <span v-else />
        <UButton
          :label="last ? sendLabel ?? definition.presentation?.submitLabel ?? t('forms.screens.fill.send') : t('forms.screens.fill.continue')"
          :trailing-icon="last ? undefined : 'i-lucide-arrow-right'"
          size="lg"
          class="justify-center"
          :loading="sending"
          @click="next"
        />
      </div>
    </div>
  </div>
</template>
