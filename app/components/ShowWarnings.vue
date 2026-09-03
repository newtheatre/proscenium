<script setup lang="ts">
import {
  CONTENT_WARNING_LEVELS,
  saysAssessment,
  saysWarningKind,
  saysWarningLevel,
  warningAssessment,
} from '#shared/utils/content-warnings'
import type {
  ContentWarning,
  ContentWarningLevel,
  ShowContentWarning,
} from '#shared/utils/content-warnings'

// What a show warns about, chosen from the vocabulary (D-102). Confirming there is nothing to warn
// about is its own answer here, distinct from nobody having looked.

const props = defineProps<{
  showId: string
  warnings: ShowContentWarning[]
  vocabulary: ContentWarning[]
  confirmedNone: boolean
}>()

const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const saving = ref(false)
const failure = ref<string | null>(null)

// A general warning is graded and a staging one is not, so the level is held per chosen warning
// and the kind decides whether the control appears at all.
const chosen = ref(new Map<string, ContentWarningLevel | null>())
const assessedClear = ref(false)

watchEffect(() => {
  chosen.value = new Map(props.warnings.map(warning => [warning.warningId, warning.level]))
  assessedClear.value = props.confirmedNone
})

const levelOptions = CONTENT_WARNING_LEVELS.map(level => ({ label: saysWarningLevel(level) ?? level, value: level }))

const assessment = computed(() => warningAssessment({
  warningsConfirmedNone: assessedClear.value,
  warningCount: chosen.value.size,
}))

function toggle(warning: ContentWarning, on: boolean): void {
  const next = new Map(chosen.value)
  if (on) next.set(warning.id, warning.kind === 'GENERAL' ? 'DEPICTED' : null)
  else next.delete(warning.id)
  chosen.value = next
  // Choosing a warning and confirming there are none are two answers to one question, so
  // choosing one withdraws the other rather than sending a body the route refuses.
  if (on) assessedClear.value = false
}

function setLevel(warningId: string, level: ContentWarningLevel): void {
  const next = new Map(chosen.value)
  next.set(warningId, level)
  chosen.value = next
}

function confirmNone(value: boolean): void {
  assessedClear.value = value
  if (value) chosen.value = new Map()
}

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/admin/shows/${props.showId}/warnings`, {
      method: 'PUT',
      body: {
        confirmedNone: assessedClear.value,
        warnings: [...chosen.value].map(([warningId, level]) => ({ warningId, level })),
      },
    })
    toast.add({ title: 'Content warnings saved', icon: 'i-lucide-check', color: 'success' })
    emit('saved')
  }
  catch (refused) {
    failure.value = refusalText(refused)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard data-test="show-warnings">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-semibold">
          Content warnings
        </h3>
        <UBadge
          :color="assessment === 'NOT_ASSESSED' ? 'warning' : 'neutral'"
          variant="subtle"
          data-test="assessment"
        >
          {{ saysAssessment(assessment) }}
        </UBadge>
      </div>
    </template>

    <div class="space-y-4">
      <UAlert
        v-if="failure"
        data-test="warnings-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <p class="text-sm text-muted">
        A show warns from the vocabulary rather than in its own words, so two shows warning about
        the same thing say it the same way. Confirming there is nothing to warn about is an answer
        somebody gave; leaving it blank means nobody has looked yet, and the show page says so.
      </p>

      <USwitch
        :model-value="assessedClear"
        label="Assessed, and there is nothing to warn about"
        data-test="confirm-none"
        @update:model-value="confirmNone"
      />

      <p
        v-if="vocabulary.length === 0"
        class="text-sm text-muted"
        data-test="warnings-empty"
      >
        The vocabulary is empty. Add warnings under Box office, Content warnings, and they appear
        here to choose from.
      </p>

      <ul
        v-else
        class="divide-y divide-default"
      >
        <li
          v-for="warning in vocabulary"
          :key="warning.id"
          class="flex flex-wrap items-center gap-3 py-2"
        >
          <UCheckbox
            :model-value="chosen.has(warning.id)"
            :label="warning.title"
            :data-test="`warning-${warning.slug}`"
            @update:model-value="value => toggle(warning, value === true)"
          />
          <UBadge
            :color="warning.kind === 'TECHNICAL' ? 'info' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ saysWarningKind(warning.kind) }}
          </UBadge>
          <UBadge
            v-if="warning.archived"
            color="neutral"
            variant="outline"
            size="sm"
          >
            Archived
          </UBadge>
          <USelect
            v-if="chosen.has(warning.id) && warning.kind === 'GENERAL'"
            :model-value="chosen.get(warning.id) ?? 'DEPICTED'"
            :items="levelOptions"
            size="sm"
            class="ms-auto w-44"
            :data-test="`level-${warning.slug}`"
            @update:model-value="value => setLevel(warning.id, value as ContentWarningLevel)"
          />
        </li>
      </ul>

      <div class="flex justify-end">
        <UButton
          :loading="saving"
          data-test="save-warnings"
          @click="save"
        >
          Save warnings
        </UButton>
      </div>
    </div>
  </UCard>
</template>
