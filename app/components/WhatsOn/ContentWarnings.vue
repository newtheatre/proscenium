<script setup lang="ts">
/**
 * Content warnings for a show.
 *
 * The schema distinguishes three states and so does this component, because
 * conflating the last two is the failure that matters: "the company checked and
 * there are none" is a reassurance, "nobody has filled this in" is an absence of
 * information, and showing silence as though it meant safety is how someone ends
 * up in the room for something they needed to know about.
 *
 * Warnings sit on one of three axes — what happens on stage, what is discussed,
 * and what the production does technically (strobe, haze, loud noise). They are
 * grouped that way because the distinction changes what someone needs to decide.
 */

interface ShowContentWarning {
  kind: 'ACTION' | 'DIALOGUE' | 'TECHNICAL'
  contentWarning: { id: string, title: string, icon: string | null }
}

const props = defineProps<{
  warnings: ShowContentWarning[]
  notes: string | null
  confirmedNone: boolean
}>()

const AXES = [
  { kind: 'TECHNICAL' as const, label: 'Technical effects', hint: 'Strobe lighting, haze, loud noise and similar', icon: 'i-lucide-zap' },
  { kind: 'ACTION' as const, label: 'Depicted on stage', hint: 'Shown as part of the action', icon: 'i-lucide-drama' },
  { kind: 'DIALOGUE' as const, label: 'Referred to', hint: 'Discussed or described rather than shown', icon: 'i-lucide-message-circle' },
]

const groups = computed(() =>
  AXES
    .map(axis => ({
      ...axis,
      items: props.warnings
        .filter(w => w.kind === axis.kind)
        .map(w => w.contentWarning)
        // The same warning can be linked twice through different legacy rows.
        .filter((w, i, all) => all.findIndex(o => o.id === w.id) === i)
        .sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .filter(group => group.items.length > 0),
)

const hasWarnings = computed(() => groups.value.length > 0)

// Technical effects go first: strobe and haze are the ones with an immediate
// physical consequence for someone who needs to avoid them.
const state = computed(() => {
  if (hasWarnings.value) return 'listed'
  if (props.confirmedNone) return 'none'
  return 'unknown'
})
</script>

<template>
  <section aria-labelledby="content-warnings-heading">
    <h2
      id="content-warnings-heading"
      class="text-2xl font-bold text-default mb-4"
    >
      Content warnings
    </h2>

    <!-- Checked, and there are none. -->
    <UAlert
      v-if="state === 'none'"
      color="success"
      variant="subtle"
      icon="i-lucide-check-circle"
      title="No content warnings"
      description="The company has confirmed this production has no content warnings."
    />

    <!-- Nobody filled it in. Say so rather than implying there is nothing. -->
    <UAlert
      v-else-if="state === 'unknown'"
      color="neutral"
      variant="subtle"
      icon="i-lucide-help-circle"
      title="No content warnings recorded"
      description="We do not have content warning information for this production. If you would like to check before booking, please contact the box office."
    />

    <template v-else>
      <div class="space-y-4">
        <div
          v-for="group in groups"
          :key="group.kind"
        >
          <div class="flex items-baseline gap-2 mb-2">
            <UIcon
              :name="group.icon"
              class="size-4 shrink-0 text-muted self-center"
            />
            <h3 class="font-semibold text-default">
              {{ group.label }}
            </h3>
            <span class="text-xs text-muted">{{ group.hint }}</span>
          </div>

          <ul class="flex flex-wrap gap-2">
            <li
              v-for="warning in group.items"
              :key="warning.id"
            >
              <UBadge
                color="warning"
                variant="subtle"
                :icon="warning.icon ?? undefined"
                :label="warning.title"
              />
            </li>
          </ul>
        </div>
      </div>

      <p
        v-if="notes"
        class="mt-4 text-sm text-muted whitespace-pre-line"
      >
        {{ notes }}
      </p>
    </template>
  </section>
</template>
