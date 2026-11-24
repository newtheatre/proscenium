<!-- One place on M8: unmarked, two large controls, "Here" and "Not here"; marked, the mark as a word
     and "Change", which marks the other way while attendance is open. -->
<script setup lang="ts">
import type { Place } from '../../server/sessions'

// A function rather than an event, so each button spins until its mark is saved.
const props = defineProps<{ place: Place, disabled?: boolean, mark: (state: 'attended' | 'absent') => Promise<void> }>()

const { t } = useT()
const name = computed(() => props.place.name ?? t('training.teaching.no-name'))
const marked = computed(() => props.place.state === 'attended' || props.place.state === 'absent')
const other = computed(() => props.place.state === 'attended' ? 'absent' : 'attended')
</script>

<template>
  <RecordListItem :name="name">
    <div
      v-if="!marked"
      class="flex gap-2"
    >
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        :label="t('training.attendance.here')"
        :aria-label="t('training.attendance.here-for', { name })"
        :disabled="disabled"
        loading-auto
        @click="mark('attended')"
      />
      <UButton
        color="neutral"
        variant="outline"
        size="xl"
        :label="t('training.attendance.not-here')"
        :aria-label="t('training.attendance.not-here-for', { name })"
        :disabled="disabled"
        loading-auto
        @click="mark('absent')"
      />
    </div>
    <div
      v-else
      class="flex items-center gap-3"
    >
      <StatusBadge
        :tone="place.state === 'attended' ? 'success' : 'neutral'"
        :label="t(place.state === 'attended' ? 'training.attendance.here' : 'training.attendance.not-here')"
      />
      <UButton
        v-if="!disabled"
        color="neutral"
        variant="link"
        :label="t('training.attendance.change')"
        :aria-label="t('training.attendance.change-for', { name })"
        loading-auto
        @click="mark(other)"
      />
    </div>
  </RecordListItem>
</template>
