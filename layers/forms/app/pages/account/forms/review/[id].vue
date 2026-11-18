<!-- One review, for the reviewer it was asked of (FB-405, FB-406): what was sent, and their own
     marks or vote with a comment. Nobody else's review is here until the chair releases the round.
     Somebody with a conflict of interest says so here, and from then cannot open the response. -->
<script setup lang="ts">
import type { Criterion, Definition, Vote } from '../../../../../shared/engine'
import { VOTES } from '../../../../../shared/engine'
import type { ShownAnswer } from '../../../../components/FormsAnswers.vue'
import type { ReviewResult } from '../../../../components/FormsReviewResult.vue'

interface Asked {
  id: string
  form: { title: string }
  response: { reference: string, submittedAt: number }
  stage: string
  mode: 'scores' | 'vote'
  criteria: Criterion[]
  definition: Definition
  answers: ShownAnswer[]
  mine: { status: 'assigned' | 'submitted', vote: Vote | null, scores: Record<string, number>, comment: string }
  open: boolean
  released: boolean
  result: ReviewResult | null
}
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const { confirm } = useConfirm()
const toast = useToast()
const route = useRoute()
const address = computed(() => `/api/forms/reviews/${encodeURIComponent(String(route.params.id))}`)
const { data, error, refresh } = await useAPI<Asked>(() => address.value, { key: `forms:review:${route.params.id}` })
if (error.value || !data.value) throw createError({ statusCode: 404, statusMessage: t('forms.screens.review.not-found'), fatal: true })
const asked = computed(() => data.value!)
const canChange = computed(() => asked.value.open && !asked.value.released)

// One flat state for the form: the vote, the comment, and a mark for each criterion under its id.
const state = reactive<{ vote: Vote | undefined, comment: string, marks: Record<string, number | undefined> }>({ vote: asked.value.mine.vote ?? undefined, comment: asked.value.mine.comment, marks: { ...asked.value.mine.scores } })
function validate() {
  if (asked.value.mode === 'vote') return state.vote ? [] : [{ name: 'vote', message: t('forms.screens.review.choose-vote') }]
  return asked.value.criteria.filter(c => typeof state.marks[c.id] !== 'number').map(c => ({ name: `marks.${c.id}`, message: t('forms.screens.review.give-mark', { max: c.max }) }))
}
const failure = ref<{ reason: string, remedy?: string } | null>(null)
const saving = ref(false)
const votes = computed(() => VOTES.map(value => ({ value, label: t(`forms.screens.review.vote.${value}`) })))

async function save() {
  failure.value = null
  saving.value = true
  try {
    await $api(address.value, { method: 'PUT', body: asked.value.mode === 'vote' ? { vote: state.vote, comment: state.comment } : { scores: state.marks, comment: state.comment } })
    toast.add({ title: t('forms.screens.review.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    const refusal = toRefusal(e)
    failure.value = { reason: refusal.reason, remedy: refusal.remedy }
  }
  saving.value = false
}

async function conflict() {
  if (!(await confirm({ verb: t('forms.screens.review.declare'), thing: t('forms.screens.review.declare-thing'), consequence: t('forms.screens.review.declare-consequence') }))) return
  try {
    await $api(`${address.value}/conflict` as string, { method: 'POST' })
    toast.add({ title: t('forms.screens.review.declared'), color: 'success' })
    await refreshNuxtData('forms:mine')
    await navigateTo('/account/forms')
  }
  catch (e) {
    const refusal = toRefusal(e)
    failure.value = { reason: refusal.reason, remedy: refusal.remedy }
  }
}
</script>

<template>
  <PageFrame
    :title="asked.form.title"
    :description="t('forms.screens.review.for', { reference: asked.response.reference, when: dateTime(asked.response.submittedAt) })"
    :trail="[{ label: t('forms.navigation.mine.label'), to: '/account/forms' }]"
    width="reading"
  >
    <div class="space-y-8">
      <section class="space-y-3">
        <h2 class="font-medium">
          {{ t('forms.screens.review.what-was-sent') }}
        </h2>
        <FormsAnswers
          :definition="asked.definition"
          :answers="asked.answers"
        />
      </section>

      <section class="space-y-4">
        <h2 class="font-medium">
          {{ t(asked.mode === 'vote' ? 'forms.screens.review.your-vote' : 'forms.screens.review.your-marks') }}
        </h2>
        <UAlert
          v-if="!canChange"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          :title="t(asked.open ? 'forms.screens.review.locked-released' : 'forms.screens.review.locked-moved')"
        />
        <UAlert
          v-if="failure"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="failure.reason"
          :description="failure.remedy"
        />
        <UForm
          :state="state"
          :validate="validate"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <UFormField
            v-if="asked.mode === 'vote'"
            name="vote"
            :label="t('forms.screens.review.your-vote')"
            required
          >
            <URadioGroup
              v-model="state.vote"
              :items="votes"
              :disabled="!canChange"
            />
          </UFormField>
          <template v-else>
            <UFormField
              v-for="c in asked.criteria"
              :key="c.id"
              :name="`marks.${c.id}`"
              :label="c.label"
              :help="t('forms.screens.review.mark-help', { max: c.max })"
              required
            >
              <UInputNumber
                v-model="state.marks[c.id]"
                :min="0"
                :max="c.max"
                :disabled="!canChange"
                class="w-32"
              />
            </UFormField>
          </template>
          <UFormField
            :label="t('forms.screens.review.comment')"
            :help="t('forms.screens.review.comment-help')"
            :hint="t('forms.screens.details.optional')"
          >
            <UTextarea
              v-model="state.comment"
              :rows="4"
              :disabled="!canChange"
              autoresize
            />
          </UFormField>
          <div
            v-if="canChange"
            class="flex flex-wrap gap-2"
          >
            <UButton
              type="submit"
              :label="t(asked.mine.status === 'submitted' ? 'forms.screens.review.change' : 'forms.screens.review.send')"
              :loading="saving"
            />
            <UButton
              :label="t('forms.screens.review.declare')"
              color="neutral"
              variant="ghost"
              @click="conflict"
            />
          </div>
        </UForm>
      </section>

      <section
        v-if="asked.result"
        class="space-y-3"
      >
        <h2 class="font-medium">
          {{ t('forms.screens.review.panel') }}
        </h2>
        <FormsReviewResult
          :result="asked.result"
          :mode="asked.mode"
          :released="asked.released"
        />
      </section>
    </div>
  </PageFrame>
</template>
