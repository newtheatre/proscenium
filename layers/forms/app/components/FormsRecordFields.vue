<!-- A record's custom fields (FB-503): each set of fields attached to the slot, with this record's
     answers, saved in place. A module that declares a record-mode slot places this on its record's
     page. The props are part of forms' interface to other modules. -->
<script setup lang="ts">
import type { Answers, Definition } from '../../shared/engine'

interface FieldSet { formId: string, title: string, version: number, definition: Definition, answers: Answers, revision: number, updatedAt: number | null }

const props = defineProps<{
  /** The slot's id, such as `membership.member-fields`. */
  slotId: string
  /** The id of the record the fields belong to. */
  subject: string
}>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { dateTime } = useDates()
const toast = useToast()
const at = computed(() => `/api/forms/records/${encodeURIComponent(props.slotId)}/${encodeURIComponent(props.subject)}`)
const { data, error, refresh } = await useAPI<{ today: string | null, sets: FieldSet[] }>(() => at.value, { key: `forms:record:${props.slotId}:${props.subject}` })

// What is on screen, by set: the answers as they are being changed, and the revision they started from.
const answers = ref<Record<string, Answers>>({})
const revisions = ref<Record<string, number>>({})
const savedAt = ref<Record<string, number | null>>({})
const refusal = ref<Record<string, ReturnType<typeof toRefusal> | null>>({})
watch(data, (now) => {
  for (const set of now?.sets ?? []) {
    answers.value[set.formId] = { ...set.answers }
    revisions.value[set.formId] = set.revision
    savedAt.value[set.formId] = set.updatedAt
  }
}, { immediate: true })

async function reload(formId: string) {
  refusal.value[formId] = null
  await refresh()
}
async function save(set: FieldSet, given: Answers): Promise<boolean> {
  refusal.value[set.formId] = null
  try {
    const { revision } = await $api<{ revision: number }>(`${at.value}/${set.formId}` as string, { method: 'PUT', body: { answers: given, revision: revisions.value[set.formId] ?? 0 } })
    revisions.value[set.formId] = revision
    savedAt.value[set.formId] = Date.now()
    toast.add({ title: t('forms.screens.fields.saved', { name: set.title }), color: 'success' })
  }
  catch (e) {
    refusal.value[set.formId] = toRefusal(e)
  }
  // The fields stay on screen either way: saving them is not the end of anything.
  return false
}
</script>

<template>
  <!-- A slot with no fields attached draws nothing, so the record's page has no empty block. -->
  <div
    v-if="error || data?.sets.length"
    class="space-y-8"
  >
    <RefusalNotice
      v-if="error"
      :refusal="toRefusal(error)"
    />
    <section
      v-for="set in data?.sets ?? []"
      :key="set.formId"
      class="space-y-3"
      :aria-label="set.title"
    >
      <div>
        <h3 class="font-medium">
          {{ set.title }}
        </h3>
        <p class="text-sm text-muted">
          {{ savedAt[set.formId] ? t('forms.screens.fields.last-saved', { when: dateTime(savedAt[set.formId]!) }) : t('forms.screens.fields.never-saved') }}
        </p>
      </div>
      <RefusalNotice :refusal="refusal[set.formId] ?? null" />
      <UButton
        v-if="refusal[set.formId]?.code === 'forms.record.stale'"
        :label="t('forms.screens.fields.reload')"
        size="sm"
        color="neutral"
        variant="subtle"
        @click="reload(set.formId)"
      />
      <div class="@container">
        <FormsFill
          v-model="answers[set.formId]"
          :definition="set.definition"
          :context="{ today: data?.today ?? '2000-01-01' }"
          :send-label="t('forms.screens.fields.save')"
          :send="given => save(set, given)"
        />
      </div>
    </section>
  </div>
</template>
