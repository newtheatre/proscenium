<!-- The forms in a slot that the person looking could answer now, each as a button to answer it.
     A module that declares a slot places this where its own screens should offer the form, such
     as "Nominate somebody" beside an award. It draws nothing when there is nothing to answer.
     The props are part of forms' interface to other modules. -->
<script setup lang="ts">
interface Open { subjectId: string, name: string | null, formId: string, title: string, address: string, closesAt: number | null }

const props = defineProps<{
  /** The slot's id, such as `awards.nomination`. */
  slotId: string
  /** One record's forms only. Left out, every record's. */
  subject?: string
  /** The button's words. Left out, the form's title. */
  label?: string
}>()
const { data } = await useAPI<{ open: Open[] }>(() => `/api/forms/slots/${encodeURIComponent(props.slotId)}/open`, { query: computed(() => props.subject ? { subject: props.subject } : {}), key: `forms:slot-open:${props.slotId}:${props.subject ?? '*'}` })
</script>

<template>
  <div
    v-if="data?.open.length"
    class="flex flex-wrap gap-2"
  >
    <UButton
      v-for="form in data.open"
      :key="`${form.formId}:${form.subjectId}`"
      :label="label ?? form.title"
      :to="form.address"
      icon="i-lucide-file-pen-line"
      color="neutral"
      variant="subtle"
    />
  </div>
</template>
