<!--
Content warnings for a show, editable in place (ADR-0017). "Confirmed none"
is the point of the section (ADR-0004).
-->
<script setup lang="ts">
import type { ContentWarningRef, LegacyContentWarningLink, ShowDetail } from '~~/shared/types/shows'

const props = defineProps<{ show: ShowDetail }>()
const emit = defineEmits<{ refresh: [] }>()

const toast = useToast()

interface WarningOption extends ContentWarningRef {
  archived: boolean
}

/**
 * Fetched only when the editor opens, and deliberately not the admin page's
 * key: that one includes archived entries (ADR-0013).
 */
const { data: vocabulary, status: vocabularyStatus, refresh: loadVocabulary } = useFetch<WarningOption[]>(
  '/api/content-warnings',
  {
    key: 'content-warnings',
    lazy: true,
    immediate: false,
    default: () => [],
    getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
  },
)

/** Warnings this show carried before the rework that the remap could not place. */
const { data: notCarriedOver } = await useFetch<LegacyContentWarningLink[]>(
  () => `/api/shows/${props.show.id}/legacy-content-warnings`,
  { key: () => `legacy-warnings-${props.show.id}`, lazy: true, default: () => [] },
)

const isEditing = ref(false)
const isSubmitting = ref(false)

const technicalIds = ref<string[]>([])
const generalIds = ref<string[]>([])
/**
 * No entry for a newly picked warning, so `unassigned` can tell "not looked at
 * yet" from a level someone chose.
 */
const levels = reactive(new Map<string, ContentWarningLevel>())
const notes = ref('')
const confirmedNone = ref(false)

function hydrate() {
  technicalIds.value = props.show.contentWarnings
    .filter(link => link.contentWarning?.kind === 'TECHNICAL')
    .map(link => link.contentWarningId)

  generalIds.value = props.show.contentWarnings
    .filter(link => link.contentWarning?.kind !== 'TECHNICAL')
    .map(link => link.contentWarningId)

  levels.clear()
  for (const link of props.show.contentWarnings) {
    if (link.level) levels.set(link.contentWarningId, link.level)
  }

  notes.value = props.show.contentWarningNotes ?? ''
  confirmedNone.value = props.show.warningsConfirmedNone
}

hydrate()
watch(() => props.show, hydrate)

function startEditing() {
  hydrate()
  loadVocabulary()
  isEditing.value = true
}

// ── Editing ──────────────────────────────────────────────────────────────────

/**
 * Nuxt UI's item types want `string | undefined`, not the `string | null` the
 * API returns, so the pickers get purpose-built items rather than raw rows.
 */
type PickerItem = {
  id: string
  title: string
  description: string | undefined
  category: string | undefined
}

/**
 * One shape, because the picker reads labelKey and valueKey off `keyof` the
 * entry type, and a union of a header and an item has no keys in common.
 */
type PickerEntry = Partial<PickerItem> & { type?: 'label', label?: string }

function toItem(warning: WarningOption): PickerItem {
  return {
    id: warning.id,
    title: warning.title,
    description: warning.description ?? undefined,
    category: warning.category ?? undefined,
  }
}

const technicalOptions = computed(() =>
  vocabulary.value.filter(w => w.kind === 'TECHNICAL').map(toItem),
)

/**
 * A `{ type: 'label' }` header per category, unlabelled separators would not
 * say what the groups are.
 */
const generalOptions = computed<PickerEntry[]>(() => {
  const byCategory = new Map<string, WarningOption[]>()
  for (const warning of vocabulary.value) {
    if (warning.kind === 'TECHNICAL') continue
    const key = warning.category ?? 'Other'
    const bucket = byCategory.get(key)
    if (bucket) bucket.push(warning)
    else byCategory.set(key, [warning])
  }

  return [...byCategory.entries()]
    .sort(([a], [b]) => contentWarningCategoryRank(a) - contentWarningCategoryRank(b) || a.localeCompare(b))
    .flatMap(([category, items]) => [
      { type: 'label' as const, label: category },
      ...items.sort(compareContentWarnings).map(toItem),
    ])
})

const vocabularyById = computed(() => new Map(vocabulary.value.map(w => [w.id, w])))

/** The picked general warnings, grouped by category, for the level assignment list. */
const pickedByCategory = computed(() => {
  const byCategory = new Map<string, WarningOption[]>()
  for (const id of generalIds.value) {
    const warning = vocabularyById.value.get(id)
    if (!warning) continue
    const key = warning.category ?? 'Other'
    const bucket = byCategory.get(key)
    if (bucket) bucket.push(warning)
    else byCategory.set(key, [warning])
  }

  return [...byCategory.entries()]
    .sort(([a], [b]) => contentWarningCategoryRank(a) - contentWarningCategoryRank(b) || a.localeCompare(b))
    .map(([category, items]) => ({ category, items: items.sort(compareContentWarnings) }))
})

/**
 * Picked but not yet levelled. Nothing is defaulted: a silent "mentioned" is a
 * claim nobody made (ADR-0004).
 */
const unassigned = computed(() =>
  generalIds.value
    .filter(id => !levels.get(id))
    .map(id => vocabularyById.value.get(id)?.title ?? id),
)

const canSave = computed(() => unassigned.value.length === 0)

function removeGeneral(id: string) {
  generalIds.value = generalIds.value.filter(other => other !== id)
  levels.delete(id)
}

/** Bulk assign. One imported show carries 72 warnings; setting those one at a time is how a section stops being used. */
function setAllLevels(level: ContentWarningLevel) {
  for (const id of generalIds.value) levels.set(id, level)
}

const setAllItems = computed(() =>
  CONTENT_WARNING_LEVELS.map(level => ({
    label: `Set all to ${level.label.toLowerCase()}`,
    icon: level.icon,
    onSelect: () => setAllLevels(level.value),
  })),
)

// ── Read-only view ───────────────────────────────────────────────────────────

const groups = computed(() => {
  const technical = props.show.contentWarnings
    .filter(link => link.contentWarning?.kind === 'TECHNICAL')
    .map(link => link.contentWarning!)
    .sort(compareContentWarnings)

  const levelled = CONTENT_WARNING_LEVELS.map(level => ({
    key: level.value as string,
    label: level.label,
    items: props.show.contentWarnings
      .filter(link => link.level === level.value && link.contentWarning)
      .map(link => link.contentWarning!)
      .sort(compareContentWarnings),
  }))

  return [
    { key: 'TECHNICAL', label: CONTENT_WARNING_TECHNICAL_GROUP.label, items: technical },
    ...levelled,
  ].filter(group => group.items.length > 0)
})

const hasAny = computed(() => groups.value.length > 0)
const totalSelected = computed(() => technicalIds.value.length + generalIds.value.length)

async function save() {
  isSubmitting.value = true
  try {
    await $fetch(`/api/shows/${props.show.id}`, {
      method: 'PUT',
      body: {
        contentWarningNotes: notes.value || null,
        warningsConfirmedNone: confirmedNone.value,
        contentWarnings: [
          ...technicalIds.value.map(id => ({ contentWarningId: id, level: null })),
          ...generalIds.value.map(id => ({ contentWarningId: id, level: levels.get(id)! })),
        ],
      },
    })
    toast.add({ title: 'Content warnings saved', icon: 'i-lucide-check', color: 'success' })
    isEditing.value = false
    emit('refresh')
  }
  catch (error: unknown) {
    toast.add({
      title: 'Could not save content warnings',
      description: getErrorMessage(error, 'Please try again'),
      icon: 'i-lucide-x-circle',
      color: 'error',
    })
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">
        Content warnings
      </h2>
      <UButton
        v-if="!isEditing"
        label="Edit warnings"
        icon="i-lucide-pencil"
        color="neutral"
        variant="outline"
        size="sm"
        @click="startEditing"
      />
    </div>

    <UCard>
      <!-- Read-only -->
      <template v-if="!isEditing">
        <UAlert
          v-if="!hasAny && show.warningsConfirmedNone"
          color="success"
          variant="subtle"
          icon="i-lucide-check-circle"
          title="Confirmed: this production has no content warnings"
          description="The company has checked. The show page says so explicitly."
        />
        <UAlert
          v-else-if="!hasAny"
          color="warning"
          variant="subtle"
          icon="i-lucide-alert-triangle"
          title="Nothing recorded"
          description="Nobody has filled this in, which is different from there being none. The public show page says no information was recorded."
        />

        <div
          v-else
          class="space-y-3"
        >
          <div
            v-for="group in groups"
            :key="group.key"
          >
            <p class="text-muted text-sm mb-1">
              {{ group.label }}
            </p>
            <div class="flex flex-wrap gap-1.5">
              <UBadge
                v-for="warning in group.items"
                :key="warning.id"
                :label="warning.title"
                :icon="warning.icon ?? undefined"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
          </div>
        </div>

        <div
          v-if="show.contentWarningNotes"
          class="mt-4 pt-4 border-t border-default"
        >
          <p class="text-muted text-sm mb-1">
            Notes
          </p>
          <p class="text-sm text-highlighted whitespace-pre-line">
            {{ show.contentWarningNotes }}
          </p>
        </div>

        <!-- Only rendered for the ~30 shows whose old warnings could not be placed. -->
        <div
          v-if="notCarriedOver.length"
          class="mt-4 pt-4 border-t border-default"
        >
          <p class="text-muted text-sm mb-1">
            Not carried over from the old system
          </p>
          <p class="text-xs text-muted mb-2">
            These were recorded before the warning rework and were too vague to
            place automatically. Add the closest current warning, or delete
            nothing and leave them here.
          </p>
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="(legacy, index) in notCarriedOver"
              :key="`${legacy.title}-${index}`"
              :label="legacy.title"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </div>
        </div>
      </template>

      <!-- Editing -->
      <div
        v-else
        class="space-y-5"
      >
        <div class="flex items-baseline justify-between gap-2">
          <UCheckbox
            v-model="confirmedNone"
            label="Confirmed: this production has no content warnings"
            help="Tick only if the company has actually checked."
          />
          <span
            v-if="totalSelected"
            class="text-xs text-muted shrink-0"
          >{{ totalSelected }} selected</span>
        </div>

        <UFormField
          label="Technical effects"
          help="What the production does to the room. These have no level: either it happens or it does not."
        >
          <UCheckboxGroup
            v-model="technicalIds"
            :items="technicalOptions"
            value-key="id"
            label-key="title"
            description-key="description"
            variant="card"
            size="sm"
            orientation="horizontal"
            :disabled="vocabularyStatus === 'pending'"
            :ui="{ fieldset: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2' }"
          />
        </UFormField>

        <UFormField
          label="Content"
          help="Pick what the production contains, then say how strongly each one features."
        >
          <USelectMenu
            v-model="generalIds"
            :items="generalOptions"
            :loading="vocabularyStatus === 'pending'"
            value-key="id"
            label-key="title"
            :filter-fields="['title', 'description', 'category']"
            :search-input="{ placeholder: 'Filter warnings…', icon: 'i-lucide-search' }"
            multiple
            placeholder="None selected"
            class="w-full"
          />
        </UFormField>

        <div
          v-if="generalIds.length"
          class="space-y-4"
        >
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">
              How does each one feature?
            </p>
            <UDropdownMenu :items="setAllItems">
              <UButton
                label="Set all to…"
                icon="i-lucide-list-checks"
                color="neutral"
                variant="ghost"
                size="xs"
                trailing-icon="i-lucide-chevron-down"
              />
            </UDropdownMenu>
          </div>

          <UAlert
            v-if="unassigned.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-alert-triangle"
            title="Every warning needs a level before this can be saved"
            :description="`Still to set: ${unassigned.join(', ')}`"
          />

          <div
            v-for="group in pickedByCategory"
            :key="group.category"
            class="space-y-1"
          >
            <p class="text-xs uppercase tracking-wider text-muted">
              {{ group.category }}
            </p>
            <div
              v-for="warning in group.items"
              :key="warning.id"
              class="flex items-center justify-between gap-3 py-1.5 border-b border-default last:border-0"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted truncate">
                  {{ warning.title }}
                </p>
                <p
                  v-if="warning.description"
                  class="text-xs text-muted truncate"
                >
                  {{ warning.description }}
                </p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <URadioGroup
                  :model-value="levels.get(warning.id)"
                  :items="CONTENT_WARNING_LEVELS"
                  value-key="value"
                  label-key="label"
                  variant="table"
                  orientation="horizontal"
                  indicator="hidden"
                  size="xs"
                  :ui="{ fieldset: 'grid grid-cols-3 gap-0' }"
                  @update:model-value="(level) => levels.set(warning.id, level as ContentWarningLevel)"
                />
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="`Remove ${warning.title}`"
                  @click="removeGeneral(warning.id)"
                />
              </div>
            </div>
          </div>
        </div>

        <UFormField
          label="Notes"
          help="Anything the list above cannot express: timings, intensity, how to avoid a particular moment."
        >
          <UTextarea
            v-model="notes"
            placeholder="e.g. The strobe sequence lasts about 20 seconds in Act 2."
            class="w-full"
            :rows="3"
          />
        </UFormField>

        <div class="flex flex-wrap justify-end gap-2 pt-2 border-t border-default">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="isSubmitting"
            @click="() => { isEditing = false }"
          />
          <UButton
            label="Save warnings"
            :loading="isSubmitting"
            :disabled="!canSave"
            @click="save"
          />
        </div>
      </div>
    </UCard>
  </section>
</template>
