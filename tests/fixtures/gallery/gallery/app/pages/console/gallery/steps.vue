<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ layout: 'console' })

const state = reactive({ name: '', seats: 100 })
const steps = [
  { id: 'name', label: 'Name your theatre', schema: z.object({ name: z.string().min(2, 'Give your theatre a name.') }) },
  { id: 'seats', label: 'Seats', schema: z.object({ seats: z.number().min(1, 'Choose at least 1 seat.') }) },
]
async function finish() {
  await new Promise(resolve => setTimeout(resolve, 50))
}
</script>

<template>
  <PageSteps
    v-model:state="state"
    title="Sample steps"
    flow="gallery"
    :steps="steps"
    finish-label="Set up my theatre"
    :finish="finish"
    leave-to="/console"
  >
    <template #step-name="{ state: s, errors }">
      <UFormField
        label="Theatre name"
        :error="errors.name"
      >
        <UInput
          v-model="s.name"
          class="w-full"
        />
      </UFormField>
    </template>
    <template #step-seats="{ state: s, errors }">
      <UFormField
        label="Seats in the auditorium"
        :error="errors.seats"
      >
        <UInputNumber v-model="s.seats" />
      </UFormField>
    </template>
    <template #summary="{ state: s }">
      <p>{{ s.name }} will be set up with {{ s.seats }} seats.</p>
    </template>
  </PageSteps>
</template>
