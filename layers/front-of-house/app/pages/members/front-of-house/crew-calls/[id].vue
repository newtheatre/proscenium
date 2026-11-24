<!-- A crew call as a volunteer sees it (FH-49): its dates and its sign-up questions, answered once
     before any of its shifts can be taken (CC1). The form itself is forms' own page. -->
<script setup lang="ts">
interface Mine { id: string, name: string, startsOn: string, endsOn: string, state: 'open' | 'closed', questions: boolean, answered: boolean }

const { t } = useT()
const dates = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<Mine>(() => `/api/front-of-house/crew-calls/${encodeURIComponent(id.value)}/mine`, { key: `front-of-house:crew-call-mine:${id.value}` })
const trail = computed(() => [{ label: t('front-of-house.navigation.shifts.label'), to: '/members/front-of-house' }])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: c }">
      <PageFrame
        :title="c.name"
        :description="dates.range(c.startsOn, c.endsOn)"
        :trail="trail"
        width="reading"
      >
        <div class="space-y-6">
          <UAlert
            v-if="!c.questions"
            color="neutral"
            variant="subtle"
            icon="i-lucide-circle-check"
            :title="t('front-of-house.crew-calls.nothing-to-answer')"
          />
          <UAlert
            v-else-if="c.answered"
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            :title="t('front-of-house.crew-calls.answered')"
            :description="c.state === 'open' ? t('front-of-house.crew-calls.answered-help') : undefined"
          />
          <template v-else>
            <p>{{ t('front-of-house.crew-calls.why-questions', { call: c.name }) }}</p>
            <FormsSlotOpen
              slot-id="front-of-house.crew-call"
              :subject="c.id"
              :label="t('front-of-house.crew-calls.answer')"
            />
          </template>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-calendar-search"
            to="/members/front-of-house?view=open"
            :label="t('front-of-house.crew-calls.find-shifts')"
          />
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
