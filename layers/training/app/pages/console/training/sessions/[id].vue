<!-- K4 A session (training-records part 5, "Console"): the course, when, where, places taken and who runs
     it above the tabs Places, Waiting list and, once it has started, Attendance. A draft is published;
     a published one takes "Add a person". History is the record's own. -->
<script setup lang="ts">
import type { AttendanceView } from '../../../../composables/useAttendance'

definePageMeta({ layout: 'console' })

const { t } = useT()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<AttendanceView>(() => `/api/training/sessions/${encodeURIComponent(id.value)}`, { key: `training:console-session:${id.value}` })
const { refusal, editing, cancelling, adding, started, name, primary, onPrimary, actions, recordStatus, summary } = useSessionRecord(id, data, refresh)

const booked = computed(() => (data.value?.places ?? []).filter(p => p.state !== 'waiting'))
const waiting = computed(() => (data.value?.places ?? []).filter(p => p.state === 'waiting'))
const trail = computed(() => [{ label: t('training.navigation.sessions.label'), to: '/console/training/sessions' }])
const tabs = computed(() => [
  { id: 'places', label: t('training.session-record.tab.places') },
  { id: 'waiting', label: t('training.session-record.tab.waiting') },
  ...(started.value && data.value?.session.status !== 'cancelled' ? [{ id: 'attendance', label: t('training.session-record.tab.attendance') }] : []),
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
      <PageRecord
        :title="name"
        :status="recordStatus"
        :primary="primary"
        :actions="actions"
        :summary="summary"
        record-type="training.session"
        :record-id="d.session.id"
        :tabs="tabs"
        :trail="trail"
        @primary="onPrimary"
      >
        <template #tab-places>
          <div class="space-y-4">
            <RefusalNotice :refusal="refusal" />
            <UAlert
              v-if="d.session.status === 'cancelled'"
              color="neutral"
              variant="outline"
              icon="i-lucide-calendar-x"
              :title="t('training.session-record.cancelled')"
              :description="d.session.cancelReason ?? undefined"
            />
            <UAlert
              v-else-if="d.session.status === 'unpublished'"
              color="neutral"
              variant="outline"
              icon="i-lucide-eye-off"
              :title="t('training.session-record.draft')"
            />
            <TrainingSessionPlaces
              :places="booked"
              :manage="d.actions.places"
              :started="started"
              :session-name="name"
              @changed="refresh()"
            />
          </div>
        </template>
        <template #tab-waiting>
          <TrainingSessionPlaces
            :places="waiting"
            waiting
            :manage="d.actions.places"
            :started="started"
            :session-name="name"
            @changed="refresh()"
          />
        </template>
        <template #tab-attendance>
          <TrainingSessionAttendance
            :data="d"
            @changed="refresh()"
          />
        </template>
      </PageRecord>
      <TrainingSessionDialog
        v-model:open="editing"
        :session="d.session"
        @saved="refresh()"
      />
      <TrainingSessionCancelDialog
        v-model:open="cancelling"
        :session-id="d.session.id"
        :name="name"
        :starts-at="d.session.startsAt"
        :booked="booked.length"
        :waiting="waiting.length"
        @cancelled="refresh()"
      />
      <TrainingPlaceDialog
        v-model:open="adding"
        :session-id="d.session.id"
        :exclude="(d.places ?? []).map(p => p.accountId)"
        @added="refresh()"
      />
    </template>
  </DataBoundary>
</template>
