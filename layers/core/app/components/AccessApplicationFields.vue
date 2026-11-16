<!-- The access scheme's application fields (ID-38, ID-42): ticks against the theatre's list of
     needs, each with an optional short note, the companions needed, and anything else. The person's
     own form and a reviewer applying on somebody's behalf both use it. Interim: PageForm is gaining
     'ticks' and 'radio' kinds, and the two screens move to those once they land. -->
<script setup lang="ts">
export interface AccessApplicationValue {
  needs: { term: string, note?: string }[]
  companions: 0 | 1 | 2
  other?: string
}

const props = defineProps<{
  needs: { id: string, label: string }[]
  allowNote: boolean
  /** Field errors from a refusal, by field name. */
  errors?: Record<string, string>
}>()
const model = defineModel<AccessApplicationValue>({ required: true })
const { t } = useT()

const NOTE_LIMIT = 200 // not-policy: the server's bound on a note
const OTHER_LIMIT = 1000 // not-policy: the server's bound on "anything else"

const ticked = (id: string) => model.value.needs.some(n => n.term === id)
function toggle(id: string, on: boolean | 'indeterminate') {
  const rest = model.value.needs.filter(n => n.term !== id)
  model.value = { ...model.value, needs: on === true ? [...rest, { term: id }] : rest }
}
function setNote(id: string, note: string) {
  model.value = { ...model.value, needs: model.value.needs.map(n => n.term === id ? { term: id, ...(note ? { note } : {}) } : n) }
}
const noteOf = (id: string) => model.value.needs.find(n => n.term === id)?.note ?? ''

const companionOptions = computed(() => [0, 1, 2].map(n => ({ value: n, label: t(`core.access.form.companions-${n}`) })))
const companions = computed({
  get: () => model.value.companions,
  set: (value: number) => { model.value = { ...model.value, companions: value as 0 | 1 | 2 } },
})
const other = computed({
  get: () => model.value.other ?? '',
  set: (value: string) => { model.value = { ...model.value, other: value || undefined } },
})
</script>

<template>
  <div class="space-y-6">
    <fieldset class="space-y-3">
      <legend class="mb-2 text-sm font-medium text-highlighted">
        {{ t('core.access.form.needs') }}
      </legend>
      <p class="text-sm text-muted">
        {{ t('core.access.form.needs-help') }}
      </p>
      <p
        v-if="props.errors?.needs"
        class="text-sm text-error"
      >
        {{ props.errors.needs }}
      </p>
      <div
        v-for="need in props.needs"
        :key="need.id"
        class="space-y-2"
      >
        <UCheckbox
          :model-value="ticked(need.id)"
          :label="need.label"
          @update:model-value="toggle(need.id, $event)"
        />
        <UFormField
          v-if="props.allowNote && ticked(need.id)"
          :label="t('core.access.form.note', { need: need.label })"
          :hint="t('core.access.form.optional')"
          class="ms-7"
        >
          <UInput
            :model-value="noteOf(need.id)"
            :maxlength="NOTE_LIMIT"
            class="w-full"
            @update:model-value="setNote(need.id, String($event))"
          />
        </UFormField>
      </div>
    </fieldset>

    <div class="space-y-2">
      <URadioGroup
        v-model="companions"
        :legend="t('core.access.form.companions')"
        :items="companionOptions"
      />
      <p class="text-sm text-muted">
        {{ t('core.access.form.companions-help') }}
      </p>
    </div>

    <UFormField
      :label="t('core.access.form.other')"
      :hint="t('core.access.form.optional')"
      :help="t('core.access.form.other-help')"
      :error="props.errors?.other"
    >
      <UTextarea
        v-model="other"
        :maxlength="OTHER_LIMIT"
        :rows="3"
        class="w-full"
      />
    </UFormField>
  </div>
</template>
