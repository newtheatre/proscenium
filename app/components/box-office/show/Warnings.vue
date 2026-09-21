<script setup lang="ts">
import {
  CONTENT_WARNING_LEVEL_DETAILS,
  CONTENT_WARNING_STAGING_GROUP,
  MAX_WARNING_NOTES,
  saysAssessment,
  ungradedWarnings,
  vocabularyByCategory,
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
  contentNotes: string | null
}>()

const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const saving = ref(false)
const failure = ref<string | null>(null)

// Staging is ticked, content is picked and then graded; a picked content warning with no entry
// in `levels` is one nobody has graded yet, which is not the same as one graded mentioned.
const stagingIds = ref<string[]>([])
const contentIds = ref<string[]>([])
const levels = ref(new Map<string, ContentWarningLevel>())
const assessedClear = ref(false)
const notes = ref('')

// Seeded per show, not per refresh: the screen above reloads on every other save, and a watch on
// the rows themselves would throw away ticks nobody had pressed Save on yet.
watch(() => props.showId, () => {
  stagingIds.value = props.warnings.filter(one => one.kind === 'TECHNICAL').map(one => one.warningId)
  contentIds.value = props.warnings.filter(one => one.kind === 'GENERAL').map(one => one.warningId)
  levels.value = new Map(props.warnings.flatMap(one => (one.level ? [[one.warningId, one.level] as const] : [])))
  assessedClear.value = props.confirmedNone
  notes.value = props.contentNotes ?? ''
}, { immediate: true })

const byId = computed(() => new Map(props.vocabulary.map(one => [one.id, one])))

// The group's item type wants `string | undefined` where the row holds null.
const stagingOptions = computed(() => props.vocabulary
  .filter(one => one.kind === 'TECHNICAL')
  .map(one => ({ id: one.id, title: one.archived ? `${one.title} (retired)` : one.title, description: one.description ?? undefined })))

interface PickerItem { id: string, title: string, description: string | undefined, category: string | undefined }
// One shape for a heading and an item: the picker reads its keys off the entry type, and a union
// of the two has none in common.
type PickerEntry = Partial<PickerItem> & { type?: 'label', label?: string }

// A heading per category, so the menu says what the groups are rather than drawing a line.
const contentOptions = computed<PickerEntry[]>(() => vocabularyByCategory(props.vocabulary).flatMap(group => [
  { type: 'label' as const, label: group.category },
  ...group.warnings.map(one => ({
    id: one.id,
    title: one.archived ? `${one.title} (retired)` : one.title,
    description: one.description ?? undefined,
    category: one.category ?? undefined,
  })),
]))

// The picked content warnings under their headings, which is where each one is graded.
const picked = computed(() => vocabularyByCategory(contentIds.value.flatMap((id) => {
  const one = byId.value.get(id)
  return one ? [one] : []
})))

const chosen = computed(() => [
  ...stagingIds.value.flatMap((id) => {
    const one = byId.value.get(id)
    return one ? [{ title: one.title, kind: one.kind, level: null }] : []
  }),
  ...contentIds.value.flatMap((id) => {
    const one = byId.value.get(id)
    return one ? [{ title: one.title, kind: one.kind, level: levels.value.get(id) ?? null }] : []
  }),
])

const ungraded = computed(() => ungradedWarnings(chosen.value))
const total = computed(() => stagingIds.value.length + contentIds.value.length)

const assessment = computed(() => warningAssessment({
  warningsConfirmedNone: assessedClear.value,
  warningCount: total.value,
}))

// Choosing a warning and confirming there are none are two answers to one question, so choosing
// one withdraws the other rather than sending a body the route refuses.
watch(total, (count) => {
  if (count > 0) assessedClear.value = false
})

function confirmNone(value: boolean): void {
  assessedClear.value = value
  if (value) {
    stagingIds.value = []
    contentIds.value = []
    levels.value = new Map()
  }
}

function setLevel(warningId: string, level: ContentWarningLevel): void {
  const next = new Map(levels.value)
  next.set(warningId, level)
  levels.value = next
}

function removeContent(warningId: string): void {
  contentIds.value = contentIds.value.filter(id => id !== warningId)
  const next = new Map(levels.value)
  next.delete(warningId)
  levels.value = next
}

// One imported show carries dozens of warnings; grading those one at a time is how a screen stops
// being used.
const setAllItems = computed(() => CONTENT_WARNING_LEVEL_DETAILS.map(detail => ({
  label: `Set all to ${detail.label.toLowerCase()}`,
  icon: detail.icon,
  onSelect: () => {
    levels.value = new Map(contentIds.value.map(id => [id, detail.level]))
  },
})))

const levelOptions = CONTENT_WARNING_LEVEL_DETAILS.map(detail => ({ label: detail.label, value: detail.level }))

async function save(): Promise<void> {
  saving.value = true
  failure.value = null
  try {
    // @ts-expect-error an options-carrying call has no working generic form yet (0053).
    await $fetch<unknown>(`/api/admin/shows/${props.showId}/warnings`, {
      method: 'PUT',
      body: {
        confirmedNone: assessedClear.value,
        warnings: [
          ...stagingIds.value.map(warningId => ({ warningId, level: null })),
          ...contentIds.value.map(warningId => ({ warningId, level: levels.value.get(warningId) ?? null })),
        ],
        notes: notes.value,
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

    <div class="space-y-6">
      <UAlert
        v-if="failure"
        data-test="warnings-failure"
        color="error"
        variant="subtle"
        :description="failure"
      />

      <p class="text-sm text-muted">
        A show warns in the house words, not its own. Confirming there is nothing to warn about is
        an answer somebody gave; leaving it blank means nobody has looked yet, and the show page
        says so.
      </p>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <USwitch
          :model-value="assessedClear"
          label="Assessed, and there is nothing to warn about"
          data-test="confirm-none"
          @update:model-value="confirmNone"
        />
        <span
          v-if="total"
          class="text-xs text-muted"
          data-test="warnings-count"
        >{{ plural(total, 'warning') }} chosen</span>
      </div>

      <p
        v-if="vocabulary.length === 0"
        class="text-sm text-muted"
        data-test="warnings-empty"
      >
        The vocabulary is empty. Add warnings under Box office, Content warnings, and they appear
        here to choose from.
      </p>

      <template v-else>
        <UFormField
          :label="CONTENT_WARNING_STAGING_GROUP.label"
          :description="`${CONTENT_WARNING_STAGING_GROUP.hint}. Either the show does it or it does not, so these are not graded.`"
        >
          <UCheckboxGroup
            v-model="stagingIds"
            :items="stagingOptions"
            value-key="id"
            label-key="title"
            description-key="description"
            variant="card"
            size="sm"
            data-test="staging-warnings"
            :ui="{ fieldset: 'grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3' }"
          />
        </UFormField>

        <UFormField
          label="Content"
          description="Pick what the production contains, then say how strongly each one features."
        >
          <USelectMenu
            v-model="contentIds"
            :items="contentOptions"
            value-key="id"
            label-key="title"
            :filter-fields="['title', 'description', 'category']"
            :search-input="{ placeholder: 'Find a warning', icon: 'i-lucide-search' }"
            multiple
            placeholder="Nothing chosen"
            class="w-full"
            data-test="content-warnings-picker"
          />
        </UFormField>

        <div
          v-if="contentIds.length"
          class="space-y-4"
          data-test="content-warnings-grading"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium">
              How strongly does each one feature?
            </p>
            <UDropdownMenu :items="setAllItems">
              <UButton
                label="Set all to"
                icon="i-lucide-list-checks"
                trailing-icon="i-lucide-chevron-down"
                color="neutral"
                variant="ghost"
                size="xs"
                data-test="set-all-levels"
              />
            </UDropdownMenu>
          </div>

          <UAlert
            v-if="ungraded.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Every content warning needs a grade before this can be saved"
            :description="`Still to grade: ${ungraded.join(', ')}`"
            data-test="ungraded-warnings"
          />

          <div
            v-for="group in picked"
            :key="group.category"
            class="space-y-1"
          >
            <p class="text-xs uppercase tracking-wider text-muted">
              {{ group.category }}
            </p>
            <div
              v-for="warning in group.warnings"
              :key="warning.id"
              class="flex flex-wrap items-center justify-between gap-3 border-b border-default py-2 last:border-0"
              :data-test="`warning-${warning.slug}`"
            >
              <div class="min-w-0">
                <p class="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <UIcon
                    v-if="warning.icon"
                    :name="warning.icon"
                    class="size-4 shrink-0 text-muted"
                  />
                  <span>{{ warning.title }}</span>
                  <UBadge
                    v-if="warning.archived"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  >
                    Retired
                  </UBadge>
                </p>
                <p
                  v-if="warning.description"
                  class="text-xs text-muted"
                >
                  {{ warning.description }}
                </p>
              </div>
              <div class="flex items-center gap-1">
                <URadioGroup
                  :model-value="levels.get(warning.id)"
                  :items="levelOptions"
                  value-key="value"
                  label-key="label"
                  variant="table"
                  orientation="horizontal"
                  indicator="hidden"
                  size="xs"
                  :data-test="`level-${warning.slug}`"
                  @update:model-value="value => setLevel(warning.id, value as ContentWarningLevel)"
                />
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="`Remove ${warning.title}`"
                  @click="removeContent(warning.id)"
                />
              </div>
            </div>
          </div>
        </div>
      </template>

      <UFormField
        label="Notes"
        hint="Optional"
        description="What the list cannot say: when a moment comes, how long it lasts, how to step out for it. Printed on the show page beside the warnings."
      >
        <UTextarea
          v-model="notes"
          :rows="3"
          :maxlength="MAX_WARNING_NOTES"
          placeholder="The strobe sequence lasts about 20 seconds in Act 2."
          class="w-full"
          data-test="warnings-notes"
        />
      </UFormField>

      <div class="flex justify-end">
        <UButton
          :loading="saving"
          :disabled="ungraded.length > 0"
          data-test="save-warnings"
          @click="save"
        >
          Save warnings
        </UButton>
      </div>
    </div>
  </UCard>
</template>
