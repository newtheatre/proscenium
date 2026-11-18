<!-- Box office's card on My account (C3): the person's next visit, the show and when, or that
     nothing is booked. The way in is My tickets. -->
<script setup lang="ts">
import type { MyBookings } from '../utils/my-bookings'

const props = defineProps<{ headingId: string }>()
const { t } = useT()
const { dateTime } = useDates()
const { data } = await useAPI<MyBookings>('/api/box-office/orders/mine', { key: 'box-office:mine' })
const next = computed(() => data.value?.upcoming[0])
</script>

<template>
  <AccountCard
    :heading-id="props.headingId"
    :title="t('box-office.mine.next-visit')"
    :description="next ? t('box-office.mine.next-visit-is', { show: next.production.title, when: dateTime(next.performance.startsAt) }) : t('box-office.mine.nothing-booked')"
    to="/account/tickets"
    icon="i-lucide-ticket"
    :status="next && next.state !== 'confirmed' ? { tone: 'warning', label: t(`box-office.manage.state.${next.state}`) } : undefined"
  />
</template>
