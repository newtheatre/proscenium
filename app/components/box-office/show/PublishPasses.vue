<script setup lang="ts">
import { coverPresetOn } from '#shared/utils/pass-types'
import type { CoveringPass } from '#shared/utils/pass-types'
import type { AdminPerformance, ShowVenue } from '#shared/utils/programme'

// The passes on sale for this show's dates, on the publish sheet: a tick adds the show to that
// pass as it is published, and one already covering it is shown and left alone (D-123 criterion 4).

const props = defineProps<{
  detail: { coveringPasses: CoveringPass[], performances: AdminPerformance[], venues: ShowVenue[] } | null | undefined
}>()

const ticked = defineModel<string[]>({ required: true })
const passes = computed(() => props.detail?.coveringPasses ?? [])

// Mounted each time the sheet opens, so an in-house show starts every time with its passes ticked.
onMounted(() => {
  const nights = (props.detail?.performances ?? []).map(one => ({
    status: one.status,
    isExternal: props.detail?.venues.find(venue => venue.id === one.venueId)?.isExternal ?? false,
  }))
  ticked.value = coverPresetOn(nights) ? passes.value.filter(one => !one.covered).map(one => one.id) : []
})

function setTicked(id: string, on: boolean | 'indeterminate'): void {
  ticked.value = on === true ? [...ticked.value, id] : ticked.value.filter(one => one !== id)
}
</script>

<template>
  <div
    v-if="passes.length"
    class="space-y-2"
    data-test="publish-passes"
  >
    <p class="text-sm font-medium">
      Passes on sale for its dates
    </p>
    <p class="text-sm text-muted">
      Tick each pass that should cover this show. A holder of an unticked pass is refused at the door.
    </p>
    <div
      v-for="pass in passes"
      :key="pass.id"
      :data-test="`cover-pass-${pass.id}`"
    >
      <UCheckbox
        :model-value="pass.covered || ticked.includes(pass.id)"
        :disabled="pass.covered"
        :label="pass.covered ? `${pass.name} (already covers it)` : pass.name"
        @update:model-value="value => setTicked(pass.id, value)"
      />
    </div>
  </div>
</template>
