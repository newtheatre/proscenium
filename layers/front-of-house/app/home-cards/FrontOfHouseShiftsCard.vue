<!-- The members' area home card (AC-7): the person's next shift, and how many open shifts they could
     take. Absent while they have neither (the count is zero). -->
<script setup lang="ts">
interface MyShift { shiftId: string, productionTitle: string | null, title: string | null, dutyName: string, callAt: number }
interface OpenShift { id: string, eligible: boolean, overlaps: boolean }

defineProps<{ count?: number }>()
const { t } = useT()
const { dateTime } = useDates()
const { data: mine } = await useAPI<{ coming: MyShift[] }>('/api/front-of-house/me/shifts', { key: 'front-of-house:my-shifts' })
const { data: open } = await useAPI<{ shifts: OpenShift[] }>('/api/front-of-house/open-shifts', { key: 'front-of-house:open-shifts-home' })
const next = computed(() => mine.value?.coming[0])
const takeable = computed(() => (open.value?.shifts ?? []).filter(s => s.eligible && !s.overlaps).length)
const name = (s: MyShift) => s.productionTitle ? t('front-of-house.shift.of-show', { duty: s.dutyName, show: s.productionTitle }) : s.title ? t('front-of-house.shift.of-occasion', { duty: s.dutyName, title: s.title }) : s.dutyName
</script>

<template>
  <div class="space-y-3">
    <div v-if="next">
      <p class="text-sm text-muted">
        {{ t('front-of-house.members-card.next') }}
      </p>
      <p class="font-medium">
        {{ name(next) }}
      </p>
      <p class="text-sm text-muted">
        {{ t('front-of-house.shift.call', { when: dateTime(next.callAt) }) }}
      </p>
    </div>
    <p
      v-else
      class="font-medium"
    >
      {{ t('front-of-house.members-card.none') }}
    </p>
    <p
      v-if="takeable"
      class="text-sm"
    >
      {{ t('front-of-house.members-card.open', { count: takeable }) }}
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton
        v-if="next"
        :to="`/members/front-of-house/shifts/${encodeURIComponent(next.shiftId)}`"
        :label="t('front-of-house.members-card.see-shift')"
        color="neutral"
        variant="outline"
      />
      <UButton
        v-if="takeable"
        to="/members/front-of-house/open"
        :label="t('front-of-house.my-shifts.find')"
        color="neutral"
        variant="outline"
        trailing-icon="i-lucide-arrow-right"
      />
    </div>
  </div>
</template>
