<!-- The booking action for one performance (C-39), from core.booking-action: Box office's answer when
     it is on, the theatre's external link when it is not, and nothing with neither. The answer is
     facts, and the words for each of the five states are here, so they follow the visitor's
     language. `when` names the performance for a screen reader, so a page of "Book" buttons can be
     told apart. -->
<script setup lang="ts">
interface Booking {
  state: 'available' | 'limited' | 'sold-out' | 'not-yet' | 'closed'
  link?: string
  seatsLeft?: number
  opensAt?: number
  waitingList?: string
  label?: string
  external?: true
}
const props = defineProps<{ booking: Booking | null, when: string, size?: 'sm' | 'md' | 'lg' }>()
const { t } = useT()
const { dateTime } = useDates()

const note = computed(() => {
  const b = props.booking
  if (!b) return null
  if (b.state === 'limited') return b.seatsLeft ? t('public-site.booking.seats-left', { count: b.seatsLeft }) : t('public-site.booking.last-few')
  if (b.state === 'sold-out') return t('public-site.booking.sold-out')
  if (b.state === 'not-yet') return b.opensAt ? t('public-site.booking.opens', { when: dateTime(b.opensAt) }) : t('public-site.booking.not-yet')
  if (b.state === 'closed') return t('public-site.booking.closed')
  return null
})
const bookable = computed(() => !!props.booking?.link && (props.booking.state === 'available' || props.booking.state === 'limited'))
</script>

<template>
  <div
    v-if="booking"
    class="flex flex-wrap items-center justify-end gap-x-3 gap-y-1"
  >
    <span
      v-if="note"
      class="text-sm text-muted"
    >{{ note }}</span>
    <UButton
      v-if="bookable"
      :to="booking.link"
      :target="booking.external ? '_blank' : undefined"
      :trailing-icon="booking.external ? 'i-lucide-external-link' : undefined"
      :size="size ?? 'md'"
    >
      {{ booking.label ?? t('public-site.booking.book') }}<span class="sr-only">{{ t('public-site.booking.for', { when }) }}</span>
    </UButton>
    <ULink
      v-else-if="booking.state === 'sold-out' && booking.waitingList"
      :to="booking.waitingList"
      class="text-sm font-medium text-primary hover:underline"
    >
      {{ t('public-site.booking.waiting-list') }}<span class="sr-only">{{ t('public-site.booking.for', { when }) }}</span>
    </ULink>
  </div>
</template>
