<!-- K4's Attendance tab: M8's marking in the console, once the session has started. Each place is marked
     here or not here, "Add someone" takes a walk-in, and closing needs every place marked. -->
<script setup lang="ts">
import type { AttendanceView } from '../composables/useAttendance'

const props = defineProps<{ data: AttendanceView }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const id = computed(() => props.data.session.id)
const view = computed(() => props.data)
const { places, marked, left, started, closed, mark, close } = useAttendance(id, view, async () => emit('changed'), async () => emit('changed'))
const adding = ref(false)
</script>

<template>
  <div class="space-y-4">
    <EmptyState
      v-if="!started"
      icon="i-lucide-clock"
      :title="t('training.attendance.not-started')"
    />
    <template v-else>
      <p class="text-sm text-muted">
        {{ closed ? t('training.attendance.is-closed') : t('training.attendance.count', { marked, total: places.length }) }}
      </p>
      <EmptyState
        v-if="!places.length"
        icon="i-lucide-users"
        :title="t('training.attendance.nobody')"
      />
      <RecordList
        v-else
        :label="t('training.attendance.people')"
      >
        <TrainingAttendanceRow
          v-for="p in places"
          :key="p.id"
          :place="p"
          :disabled="closed || !data.actions.run"
          :mark="state => mark(p, state)"
        />
      </RecordList>
      <div
        v-if="data.actions.run && !closed"
        class="flex flex-wrap items-center justify-between gap-2"
      >
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-user-plus"
          :label="t('training.attendance.add')"
          @click="adding = true"
        />
        <div class="flex items-center gap-3">
          <span
            v-if="left"
            class="text-sm text-muted"
          >{{ t('training.attendance.left', { count: left }) }}</span>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-lock"
            :label="t('training.attendance.close')"
            :disabled="left > 0"
            loading-auto
            @click="close"
          />
        </div>
      </div>
      <TrainingWalkInDialog
        v-model:open="adding"
        :session-id="data.session.id"
        @added="emit('changed')"
      />
    </template>
  </div>
</template>
