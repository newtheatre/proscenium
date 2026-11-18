<!-- Publishing (FB-207): what would change, how much it matters to answers already given, and
     anything that stops it, shown before the author confirms. -->
<script setup lang="ts">
import type { Problem } from '../../shared/engine'

interface Change { kind: 'added' | 'retired' | 'changed', impact: 'safe' | 'caution' | 'breaking', questionId: string, label: string, what: string[] }
interface Plan { editRevision: number, number: number, unchanged: boolean, problems: Problem[], refusals: { code: string, reason: string, questionId?: string }[], impact: Change['impact'], changes: Change[] }

const props = defineProps<{ formId: string }>()
const emit = defineEmits<{ published: [number: number], settings: [], go: [at: string] }>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const builder = useBuilder()

const plan = ref<Plan | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const confirmed = ref(false)
const unconfirmed = ref(false)
watch(open, async (now) => {
  if (!now) return
  plan.value = null
  refusal.value = null
  confirmed.value = false
  unconfirmed.value = false
  try {
    await builder.flush()
    plan.value = await $api<Plan>(`/api/forms/forms/${props.formId}/publish`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
})
const errors = computed(() => plan.value?.problems.filter(p => p.level === 'error') ?? [])
const warnings = computed(() => plan.value?.problems.filter(p => p.level === 'warning') ?? [])
const blocked = computed(() => !plan.value || errors.value.length > 0 || plan.value.refusals.length > 0 || plan.value.unchanged)
const tone = { safe: 'success', caution: 'warning', breaking: 'danger' } as const
const describe = (c: Change) => [t(`forms.screens.publish.kind-${c.kind}`), ...c.what.map(w => t(`forms.screens.publish.what.${w}`))].join(' · ')
function goTo(id?: string) {
  if (!id) return
  builder.select(id)
  open.value = false
}
function toProblem(at: string) {
  open.value = false
  emit('go', at)
}
function toSettings() {
  open.value = false
  emit('settings')
}
async function publish() {
  if (!plan.value) return
  if (plan.value.impact === 'breaking' && !confirmed.value) {
    unconfirmed.value = true
    return
  }
  refusal.value = null
  try {
    const done = await $api<{ number: number }>(`/api/forms/forms/${props.formId}/publish`, { method: 'POST', body: { editRevision: plan.value.editRevision, confirm: confirmed.value } })
    open.value = false
    emit('published', done.number)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="plan ? t('forms.screens.publish.title', { n: plan.number }) : t('forms.screens.publish.button')"
  >
    <template #body>
      <div class="space-y-4">
        <RefusalNotice :refusal="refusal" />
        <p
          v-if="!plan && !refusal"
          class="text-sm text-muted"
        >
          {{ t('forms.screens.publish.checking') }}
        </p>
        <template v-if="plan">
          <UAlert
            v-if="errors.length"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="t('forms.screens.publish.problems', { count: errors.length })"
            :description="t('forms.screens.publish.problems-help')"
          />
          <ul
            v-if="errors.length"
            class="space-y-1"
          >
            <li
              v-for="(p, i) in errors"
              :key="i"
            >
              <button
                type="button"
                class="flex w-full items-start gap-2 rounded-md p-2 text-left text-sm hover:bg-elevated"
                @click="toProblem(p.at)"
              >
                <UIcon
                  name="i-lucide-circle-alert"
                  class="mt-0.5 shrink-0 text-error"
                />
                <span><span class="font-medium">{{ formsProblemName(builder.definition.value, p.at, t) }}</span><br>{{ formsProblemWords(builder.definition.value, p, t) }}</span>
              </button>
            </li>
          </ul>
          <UAlert
            v-for="r in plan.refusals"
            :key="r.code + (r.questionId ?? '')"
            color="error"
            variant="subtle"
            icon="i-lucide-octagon-alert"
            :title="r.reason"
            :actions="r.questionId ? [{ label: t('forms.screens.publish.show'), color: 'neutral', variant: 'outline', onClick: () => goTo(r.questionId) }] : r.code === 'forms.publish.retention-needed' ? [{ label: t('forms.screens.settings.title'), color: 'neutral', variant: 'outline', onClick: toSettings }] : undefined"
          />
          <UAlert
            v-if="plan.unchanged"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :title="t('forms.screens.publish.unchanged')"
          />
          <template v-else-if="!errors.length && !plan.refusals.length">
            <div class="flex items-center gap-2">
              <StatusBadge
                :tone="tone[plan.impact]"
                :label="t(`forms.screens.publish.impact-${plan.impact}`)"
              />
              <p class="text-sm text-muted">
                {{ t(`forms.screens.publish.impact-${plan.impact}-help`) }}
              </p>
            </div>
            <RecordList
              v-if="plan.changes.length"
              :label="t('forms.screens.publish.changes')"
            >
              <RecordListItem
                v-for="c in plan.changes"
                :key="c.questionId"
                :name="c.label || t('forms.screens.builder.untitled')"
                :description="describe(c)"
              >
                <StatusBadge
                  v-if="c.impact !== 'safe'"
                  :tone="tone[c.impact]"
                  :label="t(`forms.screens.publish.impact-${c.impact}`)"
                />
              </RecordListItem>
            </RecordList>
            <p
              v-else
              class="text-sm text-muted"
            >
              {{ t('forms.screens.publish.layout-only') }}
            </p>
            <p
              v-if="warnings.length"
              class="text-sm text-warning"
            >
              {{ t('forms.screens.publish.warnings', { count: warnings.length }) }}
            </p>
            <UFormField
              v-if="plan.impact === 'breaking'"
              :error="unconfirmed && !confirmed ? t('forms.screens.publish.confirm-needed') : undefined"
            >
              <UCheckbox
                v-model="confirmed"
                :label="t('forms.screens.publish.confirm')"
                :description="t('forms.screens.publish.confirm-help')"
              />
            </UFormField>
          </template>
        </template>
      </div>
    </template>
    <template #footer>
      <UButton
        v-if="!blocked"
        loading-auto
        :label="t('forms.screens.publish.do', { n: plan!.number })"
        icon="i-lucide-send"
        @click="publish"
      />
      <UButton
        :label="t(blocked ? 'forms.screens.publish.close' : 'forms.screens.publish.cancel')"
        color="neutral"
        variant="ghost"
        @click="open = false"
      />
    </template>
  </UModal>
</template>
