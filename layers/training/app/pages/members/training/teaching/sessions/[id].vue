<!-- M8 Mark attendance (training-records part 5; TR-12, TR-13): everyone with a place, each with two
     large controls, a running count, "Add someone", and "Close attendance" once every place is marked. -->
<script setup lang="ts">
import type { AttendanceView } from '../../../../../composables/useAttendance'

const { t } = useT()
const { dateTime } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<AttendanceView>(() => `/api/training/sessions/${encodeURIComponent(id.value)}`, { key: `training:attendance:${id.value}` })
const { places, marked, left, started, closed, mark, close } = useAttendance(id, data, refresh)
const adding = ref(false)

const when = computed(() => {
  const s = data.value?.session
  return s ? [dateTime(s.startsAt), s.spaceName ?? s.placeNote].filter(Boolean).join(', ') : ''
})
const trail = computed(() => [
  { label: t('training.navigation.home.label'), to: '/members/training' },
  { label: t('training.navigation.teach.label'), to: '/members/training/teaching' },
])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: d }">
      <PageFrame
        :title="d.session.title ?? d.session.courseTitle"
        :description="when"
        :trail="trail"
        width="reading"
      >
        <template #status>
          <StatusBadge
            v-if="closed"
            tone="success"
            :label="t('training.attendance.is-closed')"
          />
          <span
            v-else-if="places.length"
            class="text-sm text-muted"
          >{{ t('training.attendance.count', { marked, total: places.length }) }}</span>
        </template>
        <EmptyState
          v-if="!d.actions.run"
          icon="i-lucide-lock"
          :title="t('training.attendance.not-yours.title')"
          :description="t('training.attendance.not-yours.description')"
        />
        <div
          v-else
          class="space-y-6"
        >
          <UAlert
            v-if="!started"
            color="neutral"
            variant="outline"
            icon="i-lucide-clock"
            :title="t('training.attendance.not-started')"
          />
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
              :disabled="!started || closed"
              :mark="state => mark(p, state)"
            />
          </RecordList>
          <UButton
            v-if="started && !closed"
            color="neutral"
            variant="ghost"
            icon="i-lucide-user-plus"
            :label="t('training.attendance.add')"
            @click="adding = true"
          />
        </div>
        <template
          v-if="d.actions.run && started && !closed"
          #footer
        >
          <div class="flex flex-col items-stretch gap-2 sm:items-end">
            <p
              v-if="left"
              class="text-center text-sm text-muted"
            >
              {{ t('training.attendance.left', { count: left }) }}
            </p>
            <UButton
              color="neutral"
              variant="outline"
              size="xl"
              block
              class="sm:w-auto"
              icon="i-lucide-lock"
              :label="t('training.attendance.close')"
              :disabled="left > 0"
              loading-auto
              @click="close"
            />
          </div>
        </template>
        <TrainingWalkInDialog
          v-model:open="adding"
          :session-id="d.session.id"
          @added="refresh()"
        />
      </PageFrame>
    </template>
  </DataBoundary>
</template>
