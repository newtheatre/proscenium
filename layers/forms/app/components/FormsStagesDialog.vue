<!-- The form's stages (FB-403), for a form that wants them: where a response goes after it is
     sent, and the moves between stages with who may make each. A form with none receives a response
     and that is the end of it, so most forms never open this. Every change is an edit to the draft
     like any other: it saves itself, can be undone, and is checked with the rest of the form. -->
<script setup lang="ts">
import { MOVERS, STAGE_KINDS, reviewWorkflow } from '../../shared/engine'
import type { Definition, Mover, Stage, StageKind, Transition, Workflow } from '../../shared/engine'

const open = defineModel<boolean>('open', { default: false })
const { t } = useT()
const builder = useBuilder()
const flow = computed<Workflow | null>(() => builder.definition.value.workflow?.stages.length ? builder.definition.value.workflow : null)

function write(change: (flow: Workflow) => void, merge?: string) {
  const next = JSON.parse(JSON.stringify(builder.definition.value)) as Definition
  next.workflow ??= { stages: [], transitions: [] }
  change(next.workflow)
  if (!next.workflow.stages.length) delete next.workflow
  builder.apply(next, merge)
}
const fresh = (taken: string[], prefix: string) => {
  let n = taken.length + 1
  while (taken.includes(`${prefix}_${n}`)) n++
  return `${prefix}_${n}`
}

function start() {
  const word = (key: string) => t(`forms.screens.stages.starting.${key}`)
  write((f) => {
    Object.assign(f, reviewWorkflow({ received: word('received'), review: word('review'), returned: word('returned'), approved: word('approved'), declined: word('declined'), start: word('start'), back: word('back'), resubmit: word('resubmit'), approve: word('approve'), decline: word('decline') }))
  })
}
const clear = () => write((f) => {
  f.stages = []
  f.transitions = []
})

const addStage = () => write((f) => { f.stages.push({ key: fresh(f.stages.map(s => s.key), 'stage'), name: '', kind: 'pending' }) })
const setStage = (key: string, change: Partial<Stage>, merge?: string) => write((f) => {
  const stage = f.stages.find(s => s.key === key)!
  Object.assign(stage, change)
  if (!stage.status?.trim()) delete stage.status
}, merge)
const removeStage = (key: string) => write((f) => {
  f.stages = f.stages.filter(s => s.key !== key)
  f.transitions = f.transitions.filter(m => m.from !== key && m.to !== key)
})
const shiftStage = (index: number, by: number) => write((f) => { f.stages.splice(index + by, 0, ...f.stages.splice(index, 1)) })

const addMove = () => write((f) => { f.transitions.push({ key: fresh(f.transitions.map(m => m.key), 'move'), from: f.stages[0]!.key, to: (f.stages[1] ?? f.stages[0]!).key, label: '', who: 'staff' }) })
const setMove = (key: string, change: Partial<Transition>, merge?: string) => write((f) => { Object.assign(f.transitions.find(m => m.key === key)!, change) }, merge)
const removeMove = (key: string) => write((f) => { f.transitions = f.transitions.filter(m => m.key !== key) })

const kinds = computed(() => STAGE_KINDS.map(value => ({ value, label: t(`forms.screens.stages.kind.${value}`) })))
const movers = computed(() => MOVERS.map(value => ({ value, label: t(`forms.screens.stages.who.${value}`) })))
const stageItems = computed(() => (flow.value?.stages ?? []).map((s, i) => ({ value: s.key, label: s.name.trim() || t('forms.screens.stages.stage-n', { n: i + 1 }) })))
const problemsAt = (at: string) => builder.problems.value.filter(p => p.at === at)
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('forms.screens.stages.title')"
    :description="t('forms.screens.stages.help')"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div
        v-if="!flow"
        class="space-y-4"
      >
        <p>{{ t('forms.screens.stages.none') }}</p>
        <div class="flex flex-wrap gap-2">
          <UButton
            :label="t('forms.screens.stages.start-review')"
            icon="i-lucide-list-checks"
            @click="start"
          />
          <UButton
            :label="t('forms.screens.stages.start-blank')"
            color="neutral"
            variant="outline"
            @click="addStage"
          />
        </div>
      </div>
      <div
        v-else
        class="space-y-8"
      >
        <section class="space-y-3">
          <div>
            <h3 class="font-medium">
              {{ t('forms.screens.stages.stages') }}
            </h3>
            <p class="text-sm text-muted">
              {{ t('forms.screens.stages.stages-help') }}
            </p>
          </div>
          <ol class="space-y-3">
            <li
              v-for="(stage, i) in flow.stages"
              :key="stage.key"
              class="space-y-1 rounded-md border border-default p-3"
            >
              <div class="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,2fr)_auto]">
                <UInput
                  :model-value="stage.name"
                  :placeholder="t('forms.screens.stages.name')"
                  :aria-label="t('forms.screens.stages.name-n', { n: i + 1 })"
                  @update:model-value="setStage(stage.key, { name: String($event) }, `stage-name:${stage.key}`)"
                />
                <USelect
                  :model-value="stage.kind"
                  :items="kinds"
                  :aria-label="t('forms.screens.stages.kind-n', { n: i + 1 })"
                  @update:model-value="setStage(stage.key, { kind: $event as StageKind })"
                />
                <UInput
                  :model-value="stage.status ?? ''"
                  :placeholder="t('forms.screens.stages.status', { name: stage.name.trim() || t('forms.screens.stages.stage-n', { n: i + 1 }) })"
                  :aria-label="t('forms.screens.stages.status-n', { n: i + 1 })"
                  @update:model-value="setStage(stage.key, { status: String($event) }, `stage-status:${stage.key}`)"
                />
                <div class="flex items-center">
                  <IconButton
                    icon="i-lucide-arrow-up"
                    size="sm"
                    :label="t('forms.screens.builder.move-up')"
                    :disabled="i === 0"
                    @click="shiftStage(i, -1)"
                  />
                  <IconButton
                    icon="i-lucide-arrow-down"
                    size="sm"
                    :label="t('forms.screens.builder.move-down')"
                    :disabled="i === flow.stages.length - 1"
                    @click="shiftStage(i, 1)"
                  />
                  <IconButton
                    icon="i-lucide-x"
                    size="sm"
                    :label="t('forms.screens.stages.remove-stage', { n: i + 1 })"
                    @click="removeStage(stage.key)"
                  />
                </div>
              </div>
              <p
                v-if="i === 0"
                class="text-sm text-muted"
              >
                {{ t('forms.screens.stages.first') }}
              </p>
              <p
                v-for="p in problemsAt(`stage:${stage.key}`)"
                :key="p.code"
                class="text-sm"
                :class="p.level === 'error' ? 'text-error' : 'text-warning'"
              >
                {{ t(`forms.problems.${p.code}`) }}
              </p>
            </li>
          </ol>
          <UButton
            :label="t('forms.screens.stages.add-stage')"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="sm"
            @click="addStage"
          />
        </section>

        <section class="space-y-3">
          <div>
            <h3 class="font-medium">
              {{ t('forms.screens.stages.moves') }}
            </h3>
            <p class="text-sm text-muted">
              {{ t('forms.screens.stages.moves-help') }}
            </p>
          </div>
          <ol class="space-y-3">
            <li
              v-for="(move, i) in flow.transitions"
              :key="move.key"
              class="space-y-1 rounded-md border border-default p-3"
            >
              <div class="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_auto]">
                <UInput
                  :model-value="move.label"
                  :placeholder="t('forms.screens.stages.move-label')"
                  :aria-label="t('forms.screens.stages.move-label-n', { n: i + 1 })"
                  @update:model-value="setMove(move.key, { label: String($event) }, `move-label:${move.key}`)"
                />
                <USelect
                  :model-value="move.from"
                  :items="stageItems"
                  :aria-label="t('forms.screens.stages.from-n', { n: i + 1 })"
                  @update:model-value="setMove(move.key, { from: String($event) })"
                />
                <USelect
                  :model-value="move.to"
                  :items="stageItems"
                  :aria-label="t('forms.screens.stages.to-n', { n: i + 1 })"
                  @update:model-value="setMove(move.key, { to: String($event) })"
                />
                <USelect
                  :model-value="move.who"
                  :items="movers"
                  :aria-label="t('forms.screens.stages.who-n', { n: i + 1 })"
                  @update:model-value="setMove(move.key, { who: $event as Mover })"
                />
                <IconButton
                  icon="i-lucide-x"
                  size="sm"
                  :label="t('forms.screens.stages.remove-move', { n: i + 1 })"
                  @click="removeMove(move.key)"
                />
              </div>
              <p
                v-for="p in problemsAt(`move:${move.key}`)"
                :key="p.code"
                class="text-sm"
                :class="p.level === 'error' ? 'text-error' : 'text-warning'"
              >
                {{ t(`forms.problems.${p.code}`) }}
              </p>
            </li>
          </ol>
          <p
            v-if="!flow.transitions.length"
            class="text-sm text-muted"
          >
            {{ t('forms.screens.stages.no-moves') }}
          </p>
          <UButton
            :label="t('forms.screens.stages.add-move')"
            icon="i-lucide-plus"
            color="neutral"
            variant="outline"
            size="sm"
            @click="addMove"
          />
        </section>
      </div>
    </template>
    <template
      v-if="flow"
      #footer
    >
      <UButton
        :label="t('forms.screens.stages.clear')"
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        @click="clear"
      />
      <UButton
        :label="t('forms.screens.publish.close')"
        color="neutral"
        variant="outline"
        class="ms-auto"
        @click="open = false"
      />
    </template>
  </UModal>
</template>
