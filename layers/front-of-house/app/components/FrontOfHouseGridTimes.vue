<!-- A call time and an end time, as 24-hour clock times (FH-48). An end before the call is the next
     morning, and the help says so. -->
<script setup lang="ts">
import { timeText, timeValue } from '../utils/rota-grid'

const call = defineModel<string>('call', { required: true })
const end = defineModel<string>('end', { required: true })
const { t } = useT()
</script>

<template>
  <div class="flex flex-wrap gap-4">
    <UFormField
      name="callTime"
      :label="t('front-of-house.grid.call-time')"
      required
    >
      <UInputTime
        :model-value="timeValue(call)"
        :hour-cycle="24"
        @update:model-value="v => call = timeText(v)"
      />
    </UFormField>
    <UFormField
      name="endTime"
      :label="t('front-of-house.grid.end-time')"
      :help="t('front-of-house.grid.end-help')"
      required
    >
      <UInputTime
        :model-value="timeValue(end)"
        :hour-cycle="24"
        @update:model-value="v => end = timeText(v)"
      />
    </UFormField>
  </div>
</template>
