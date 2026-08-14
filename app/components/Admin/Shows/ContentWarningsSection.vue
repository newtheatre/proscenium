<!--
  Content warnings for a show, editable in place.

  Its own section rather than a block inside the details form, because it is its
  own concern: three axes over a shared 384-entry vocabulary, plus free text, plus
  the "confirmed none" flag. `PUT /api/shows/:id` accepts a partial body, so this
  saves warnings without touching the fields the details form owns.

  The "confirmed none" checkbox is the point of the whole section. A show with no
  warnings listed and no confirmation tells a customer nothing, and the public
  page says exactly that rather than implying the show is free of them.
-->
<script setup lang="ts">
import type { ShowContentWarningLink, ShowDetail } from '~~/shared/types/shows'

const props = defineProps<{ show: ShowDetail }>()
const emit = defineEmits<{ refresh: [] }>()

const toast = useToast()

type WarningKind = ShowContentWarningLink['kind']

interface WarningOption { id: string, title: string }

const AXES: Array<{ kind: WarningKind, label: string, hint: string }> = [
  { kind: 'TECHNICAL', label: 'Technical effects', hint: 'Strobe, haze, loud noise' },
  { kind: 'ACTION', label: 'Depicted on stage', hint: 'Shown as part of the action' },
  { kind: 'DIALOGUE', label: 'Referred to', hint: 'Discussed rather than shown' },
]

/**
 * The shared vocabulary, fetched only once a reader opens the editor.
 *
 * 384 rows came across from the legacy site. The section can render what a show
 * already has without them — the detail record carries each link's resolved
 * title — so there is no reason to pay for the list until someone is choosing
 * from it. The key is shared, so opening a second show's editor reuses it.
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

const isEditing = ref(false)
const isSubmitting = ref(false)

const selected = reactive<Record<WarningKind, string[]>>({ TECHNICAL: [], ACTION: [], DIALOGUE: [] })
const notes = ref('')
const confirmedNone = ref(false)

function hydrate() {
  for (const axis of AXES) {
    selected[axis.kind] = props.show.contentWarnings
      .filter(link => link.kind === axis.kind)
      .map(link => link.contentWarningId)
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

// ── Read-only view ───────────────────────────────────────────────────────────

const grouped = computed(() => {
  const byAxis: Record<WarningKind, string[]> = { TECHNICAL: [], ACTION: [], DIALOGUE: [] }
  for (const link of props.show.contentWarnings) {
    const title = link.contentWarning?.title
    if (title) byAxis[link.kind].push(title)
  }
  return byAxis
})

const hasAny = computed(() => Object.values(grouped.value).some(list => list.length > 0))
const totalSelected = computed(() => AXES.reduce((n, axis) => n + selected[axis.kind].length, 0))

async function save() {
  isSubmitting.value = true
  try {
    await $fetch(`/api/shows/${props.show.id}`, {
      method: 'PUT',
      body: {
        contentWarningNotes: notes.value || null,
        warningsConfirmedNone: confirmedNone.value,
        contentWarnings: AXES.flatMap(axis =>
          selected[axis.kind].map(id => ({ contentWarningId: id, kind: axis.kind })),
        ),
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
            v-for="axis in AXES"
            :key="axis.kind"
          >
            <p class="text-muted text-sm mb-1">
              {{ axis.label }}
            </p>
            <div
              v-if="grouped[axis.kind].length"
              class="flex flex-wrap gap-1.5"
            >
              <UBadge
                v-for="title in grouped[axis.kind]"
                :key="title"
                :label="title"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
            <p
              v-else
              class="text-sm text-highlighted"
            >
              —
            </p>
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
      </template>

      <!-- Editing -->
      <div
        v-else
        class="space-y-4"
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
          v-for="axis in AXES"
          :key="axis.kind"
          :label="axis.label"
          :help="axis.hint"
        >
          <USelectMenu
            v-model="selected[axis.kind]"
            :items="vocabulary"
            :loading="vocabularyStatus === 'pending'"
            value-key="id"
            label-key="title"
            multiple
            searchable
            placeholder="None"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Notes"
          help="Anything the list above cannot express — timings, intensity, how to avoid a particular moment."
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
            @click="isEditing = false"
          />
          <UButton
            label="Save warnings"
            :loading="isSubmitting"
            @click="save"
          />
        </div>
      </div>
    </UCard>
  </section>
</template>
