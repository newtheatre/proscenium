<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ layout: 'console' })

const schema = z.object({
  companions: z.number().int().min(0).max(2),
  needs: z.array(z.object({ value: z.string(), note: z.string().max(200).optional() })).min(1, 'Choose at least one.'),
})
const fields = [
  { name: 'companions', label: 'Companions', kind: 'radio' as const, options: [{ value: 0, label: 'None' }, { value: 1, label: 'One' }, { value: 2, label: 'Two' }] },
  {
    name: 'needs',
    label: 'What helps',
    kind: 'ticks' as const,
    options: [{ value: 'step-free', label: 'Step-free access' }, { value: 'hearing', label: 'Hearing loop' }, { value: 'seat', label: 'An aisle seat' }],
    notes: { max: 200, label: 'Anything we should know?' },
  },
]
const saved = ref('')
async function submit(values: Record<string, unknown>) {
  saved.value = JSON.stringify(values)
}
</script>

<template>
  <div>
    <PageForm
      title="Sample choices"
      submit-label="Save choices"
      :schema="schema"
      :fields="fields"
      :initial="{ companions: 0, needs: [] }"
      :submit="submit"
      return-to="/console/gallery/choices"
    />
    <p
      v-if="saved"
      data-testid="saved"
    >
      {{ saved }}
    </p>
  </div>
</template>
