<script setup lang="ts">
import { ID_TYPES, REFUSAL_REASONS, saysIdType, saysRefusalReason } from '#shared/utils/age-checks'
import type { IdType, InlineAgeCheckInput, RefusalReason } from '#shared/utils/age-checks'

export type AgeCheckStep = 'closed' | 'choose' | 'refuse'

// Two taps for the routine pass case (F-106 criterion 2): the ID type button both records the
// outcome and submits. A refusal needs a reason and a description before it can go through.

const props = defineProps<{ charging: boolean, product: string | null }>()

// The line that raised the ask, so nobody has to work out which drink is being checked for.
const says = computed(() => props.product ? `${props.product} is age-restricted.` : 'This basket has an age-restricted line.')
const emit = defineEmits<{ accept: [InlineAgeCheckInput], refuse: [InlineAgeCheckInput] }>()

const step = defineModel<AgeCheckStep>('step', { required: true })

const reason = ref<RefusalReason | null>(null)
const description = ref('')
const error = ref<string | null>(null)

// The step this modal is on doubles as whether it is open at all, so closing it (from any
// direction) clears the fields the same way resetting for the next sale would.
watch(step, (value) => {
  if (value !== 'closed') return
  reason.value = null
  description.value = ''
  error.value = null
})

function accept(idType: IdType): void {
  emit('accept', { outcome: 'ACCEPTED', idType, reason: null, description: description.value.trim() || 'Checked at the till', notes: null })
}

function refuse(): void {
  if (!reason.value) {
    error.value = 'Say why, because a refusal needs a reason on the record'
    return
  }
  if (!description.value.trim()) {
    error.value = 'Describe who you checked, never by name'
    return
  }
  error.value = null
  emit('refuse', { outcome: 'REFUSED', idType: null, reason: reason.value, description: description.value.trim(), notes: null })
}
</script>

<template>
  <UModal
    :open="step !== 'closed'"
    title="Challenge 25"
    :description="says"
    @update:open="step = 'closed'"
  >
    <template #body>
      <div
        v-if="step === 'choose'"
        class="space-y-3"
      >
        <p
          class="text-sm text-muted"
          data-test="age-check-product"
        >
          {{ says }} What ID was shown?
        </p>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            v-for="idType in ID_TYPES"
            :key="idType"
            color="neutral"
            variant="subtle"
            class="min-h-12"
            :loading="charging"
            :data-test="`age-check-id-${idType}`"
            @click="accept(idType)"
          >
            {{ saysIdType(idType) }}
          </UButton>
        </div>
        <UButton
          block
          color="error"
          variant="subtle"
          class="min-h-12"
          data-test="age-check-refuse"
          @click="step = 'refuse'"
        >
          Refused
        </UButton>
      </div>

      <div
        v-else
        class="space-y-3"
      >
        <p class="text-sm text-muted">
          Why was it refused?
        </p>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            v-for="option in REFUSAL_REASONS"
            :key="option"
            color="neutral"
            :variant="reason === option ? 'solid' : 'subtle'"
            class="min-h-12"
            :data-test="`age-check-reason-${option}`"
            @click="reason = option"
          >
            {{ saysRefusalReason(option) }}
          </UButton>
        </div>
        <UTextarea
          v-model="description"
          placeholder="Describe who you checked, never by name"
          data-test="age-check-description"
        />
        <UAlert
          v-if="error"
          data-test="age-check-error"
          color="error"
          variant="subtle"
          :description="error"
        />
        <UButton
          block
          color="error"
          class="min-h-12"
          :loading="charging"
          data-test="age-check-confirm-refuse"
          @click="refuse"
        >
          Confirm refusal
        </UButton>
      </div>
    </template>
  </UModal>
</template>
