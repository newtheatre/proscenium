<script setup lang="ts">
/**
 * Three states, and the difference between the last two is the point: showing
 * silence as safety is the failure this exists to prevent (ADR-0004).
 */
import type { PublicShowContentWarning } from '~~/shared/types/shows'

const props = defineProps<{
  warnings: PublicShowContentWarning[]
  notes: string | null
  confirmedNone: boolean
}>()

/**
 * Technical first, then levels strongest-first. Sorted here because the
 * response is one flat list and the grouping is a display decision.
 */
const groups = computed(() => {
  const technical = props.warnings
    .filter(link => link.contentWarning?.kind === 'TECHNICAL')
    .map(link => link.contentWarning)
    .sort(compareContentWarnings)

  const levelled = CONTENT_WARNING_LEVELS.map(level => ({
    key: level.value,
    label: level.label,
    hint: level.hint,
    icon: level.icon,
    items: props.warnings
      .filter(link => link.level === level.value)
      .map(link => link.contentWarning)
      .sort(compareContentWarnings),
  }))

  return [
    {
      key: 'TECHNICAL',
      label: CONTENT_WARNING_TECHNICAL_GROUP.label,
      hint: CONTENT_WARNING_TECHNICAL_GROUP.hint,
      icon: CONTENT_WARNING_TECHNICAL_GROUP.icon,
      items: technical,
    },
    ...levelled,
  ].filter(group => group.items.length > 0)
})

const state = computed(() => {
  if (groups.value.length > 0) return 'listed'
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
          :key="group.key"
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
                :title="warning.description ?? undefined"
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
