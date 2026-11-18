<!-- Review on a stage (FB-405, and the vote of change 1): whether responses that arrive are
     reviewed, by whom, and how, as marks against criteria or as a vote. Only a stage that means
     "being considered" offers it. -->
<script setup lang="ts">
import { PASS_MARKS } from '../../shared/engine'
import type { Criterion, PassMark, Review, Stage } from '../../shared/engine'

const props = defineProps<{ stage: Stage, n: number, roles: { id: string, name: string }[], people: Record<string, string> }>()
const emit = defineEmits<{ change: [review: Review | undefined, merge?: string], named: [id: string, name: string] }>()
const { t } = useT()
const review = computed(() => props.stage.review)

const NONE = 'none'
const modes = computed(() => [NONE, 'vote', 'scores'].map(value => ({ value, label: t(`forms.screens.review.mode.${value}`) })))
function setMode(mode: string) {
  if (mode === NONE) return emit('change', undefined)
  const kept = review.value?.reviewers ?? {}
  emit('change', mode === 'vote'
    ? { mode: 'vote', reviewers: kept, pass: 'majority', quorum: 1 }
    : { mode: 'scores', reviewers: kept, criteria: [{ id: 'c1', label: '', max: 5 }] }) // not-policy: a starting scale, changed in the row
}
function set(change: (r: Review) => void, merge?: string) {
  const next = JSON.parse(JSON.stringify(review.value)) as Review
  change(next)
  if (!next.reviewers.people?.length) delete next.reviewers.people
  if (!next.reviewers.role) delete next.reviewers.role
  if (!next.open) delete next.open
  if (!next.secret) delete next.secret
  emit('change', next, merge)
}

const ANY = 'nobody'
const roleItems = computed(() => [{ value: ANY, label: t('forms.screens.review.no-role') }, ...props.roles.map(r => ({ value: r.id, label: r.name }))])
const adding = ref<string | undefined>()
function picked(person: { id: string, label: string } | undefined) {
  if (!person) return
  emit('named', person.id, person.label)
  set((r) => { r.reviewers.people = [...new Set([...(r.reviewers.people ?? []), person.id])] })
  // The picker writes its own value after it says who was picked: clear the box once it has.
  nextTick(() => { adding.value = undefined })
}
const passes = computed(() => PASS_MARKS.map(value => ({ value, label: t(`forms.screens.review.pass.${value}`) })))

function addCriterion() {
  set((r) => {
    const taken = (r.criteria ?? []).map(c => c.id)
    let n = taken.length + 1
    while (taken.includes(`c${n}`)) n++
    r.criteria = [...(r.criteria ?? []), { id: `c${n}`, label: '', max: 5 }] // not-policy: a starting scale, changed in the row
  })
}
const setCriterion = (id: string, change: Partial<Criterion>, merge?: string) => set((r) => {
  const c = r.criteria!.find(c => c.id === id)!
  Object.assign(c, change)
  if (c.weight === undefined || c.weight === 1) delete c.weight
}, merge)
</script>

<template>
  <div class="space-y-3 border-t border-default pt-3">
    <UFormField :label="t('forms.screens.review.title')">
      <USelect
        :model-value="review?.mode ?? NONE"
        :items="modes"
        class="sm:w-72"
        :aria-label="t('forms.screens.review.mode-n', { n })"
        @update:model-value="setMode(String($event))"
      />
    </UFormField>
    <template v-if="review">
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField
          :label="t('forms.screens.review.role')"
          :help="t('forms.screens.review.role-help')"
        >
          <USelect
            :model-value="review.reviewers.role ?? ANY"
            :items="roleItems"
            @update:model-value="set((r) => { r.reviewers.role = $event === ANY ? undefined : String($event) })"
          />
        </UFormField>
        <UFormField
          :label="t('forms.screens.review.people')"
          :help="t('forms.screens.review.people-help')"
        >
          <PersonPicker
            v-model="adding"
            :exclude="review.reviewers.people"
            :placeholder="t('forms.screens.review.add-person')"
            @picked="picked"
          />
        </UFormField>
      </div>
      <ul
        v-if="review.reviewers.people?.length"
        class="flex flex-wrap gap-2"
        :aria-label="t('forms.screens.review.people')"
      >
        <li
          v-for="id in review.reviewers.people"
          :key="id"
          class="flex items-center gap-1 rounded-md border border-default py-0.5 ps-2 text-sm"
        >
          {{ people[id] ?? t('forms.screens.review.somebody') }}
          <IconButton
            icon="i-lucide-x"
            size="xs"
            :label="t('forms.screens.review.remove-person', { name: people[id] ?? t('forms.screens.review.somebody') })"
            @click="set((r) => { r.reviewers.people = r.reviewers.people!.filter(p => p !== id) })"
          />
        </li>
      </ul>

      <div
        v-if="review.mode === 'vote'"
        class="space-y-3"
      >
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField
            :label="t('forms.screens.review.pass-mark')"
            :help="t('forms.screens.review.pass-help')"
          >
            <USelect
              :model-value="review.pass ?? 'majority'"
              :items="passes"
              @update:model-value="set((r) => { r.pass = $event as PassMark })"
            />
          </UFormField>
          <UFormField
            :label="t('forms.screens.review.quorum')"
            :help="t('forms.screens.review.quorum-help')"
          >
            <UInputNumber
              :model-value="review.quorum ?? 1"
              :min="1"
              :max="40"
              class="w-32"
              @update:model-value="set((r) => { r.quorum = Number($event) || 1 }, `quorum:${stage.key}`)"
            />
          </UFormField>
        </div>
        <UCheckbox
          :model-value="!!review.secret"
          :label="t('forms.screens.review.secret')"
          :description="t('forms.screens.review.secret-help')"
          @update:model-value="set((r) => { r.secret = $event === true })"
        />
      </div>

      <div
        v-else
        class="space-y-2"
      >
        <p class="text-sm font-medium">
          {{ t('forms.screens.review.criteria') }}
        </p>
        <ol class="space-y-2">
          <li
            v-for="(c, i) in review.criteria ?? []"
            :key="c.id"
            class="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]"
          >
            <UFormField :label="t('forms.screens.review.criterion-n', { n: i + 1 })">
              <UInput
                :model-value="c.label"
                :placeholder="t('forms.screens.review.criterion')"
                @update:model-value="setCriterion(c.id, { label: String($event) }, `criterion:${stage.key}:${c.id}`)"
              />
            </UFormField>
            <UFormField :label="t('forms.screens.review.max')">
              <UInputNumber
                :model-value="c.max"
                :min="1"
                :max="100"
                @update:model-value="setCriterion(c.id, { max: Number($event) || 1 }, `max:${stage.key}:${c.id}`)"
              />
            </UFormField>
            <UFormField :label="t('forms.screens.review.weight')">
              <UInputNumber
                :model-value="c.weight ?? 1"
                :min="0"
                :max="100"
                @update:model-value="setCriterion(c.id, { weight: Number($event ?? 1) }, `weight:${stage.key}:${c.id}`)"
              />
            </UFormField>
            <IconButton
              icon="i-lucide-x"
              size="sm"
              :label="t('forms.screens.review.remove-criterion', { n: i + 1 })"
              @click="set((r) => { r.criteria = r.criteria!.filter(x => x.id !== c.id) })"
            />
          </li>
        </ol>
        <UButton
          :label="t('forms.screens.review.add-criterion')"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          size="sm"
          @click="addCriterion"
        />
      </div>
      <UCheckbox
        :model-value="!!review.open"
        :label="t('forms.screens.review.open')"
        :description="t('forms.screens.review.open-help')"
        @update:model-value="set((r) => { r.open = $event === true })"
      />
    </template>
  </div>
</template>
