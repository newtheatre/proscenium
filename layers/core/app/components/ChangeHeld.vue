<!-- What holds up a change to a performance, inside the window making the change. Where the module
     that refused asks one question (box office: what happens to the bookings), it is asked here and
     the answer is posted to the module before the change is made; otherwise its reason and link show. -->
<script setup lang="ts">
export interface HeldRefusal { code: string, reason: string, link: string | null, question?: { label: string, field: string, post: string, options: { value: string, label: string, description?: string }[] } | null }

defineProps<{ refusal: HeldRefusal | null }>()
const answer = defineModel<string | undefined>('answer')
</script>

<template>
  <template v-if="refusal">
    <UAlert
      :color="refusal.question ? 'warning' : 'error'"
      :variant="refusal.question ? 'subtle' : undefined"
      :icon="refusal.question ? 'i-lucide-triangle-alert' : 'i-lucide-circle-x'"
      :title="refusal.reason"
    >
      <template
        v-if="refusal.link && !refusal.question"
        #description
      >
        <ULink :to="refusal.link">
          See what is holding it
        </ULink>
      </template>
    </UAlert>
    <UFormField
      v-if="refusal.question"
      name="changeAnswer"
      :label="refusal.question.label"
      required
    >
      <URadioGroup
        v-model="answer"
        :items="refusal.question.options"
      />
    </UFormField>
  </template>
</template>
