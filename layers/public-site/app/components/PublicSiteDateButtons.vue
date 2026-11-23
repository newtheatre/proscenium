<!-- A show's next few dates as buttons, each straight to booking (concept A, "Spotlight"), for the
     spotlight on what's on and the top of a show's page. A date whose booking names a drawer opens it
     over the page; with scripts off, or a new tab asked for, the link is followed. `more` is where the
     rest of the dates are. -->
<script setup lang="ts">
interface Booking { state: 'available' | 'limited' | 'sold-out' | 'not-yet' | 'closed', link?: string, external?: true, drawer?: string, seatsLeft?: number, sellingFast?: true }
interface Performance { id: string, startsAt: number, state: 'scheduled' | 'cancelled' | 'completed', booking: Booking | null }

const props = defineProps<{ performances: Performance[], title: string, more: string, shown?: number }>()
const { t } = useT()
const { dayBrief, time, dateTime } = useDates()

const now = Date.now()
const upcoming = computed(() => props.performances.filter(p => p.state === 'scheduled' && p.startsAt >= now))
const dates = computed(() => upcoming.value.slice(0, props.shown ?? 4)) // not-policy: how many dates fit on one line
const rest = computed(() => upcoming.value.length - dates.value.length)
const bookable = (b: Booking | null) => !!b?.link && (b.state === 'available' || b.state === 'limited')
// The same words as the booking button, shorter: "12 left" fits under a date.
const note = (b: Booking | null) => b?.state === 'limited' ? (b.seatsLeft ? t('public-site.booking.left', { count: b.seatsLeft }) : t('public-site.booking.last-few')) : b?.state === 'available' && b.sellingFast ? t('public-site.booking.selling-fast') : b?.state === 'sold-out' ? t('public-site.booking.sold-out') : b?.state === 'not-yet' ? t('public-site.booking.not-yet') : b?.state === 'closed' ? t('public-site.booking.closed') : ''

const drawn = ref<{ booking: Booking, startsAt: number } | null>(null)
const open = ref(false)
function book(event: MouseEvent, p: Performance) {
  if (!p.booking?.drawer || p.booking.external || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  drawn.value = { booking: p.booking, startsAt: p.startsAt }
  open.value = true
}
</script>

<template>
  <div v-if="dates.length">
    <ul
      class="flex flex-wrap gap-2"
      :aria-label="t('public-site.whats-on.next-dates')"
    >
      <li
        v-for="p in dates"
        :key="p.id"
      >
        <UButton
          v-if="bookable(p.booking)"
          :to="p.booking!.link"
          :target="p.booking!.external ? '_blank' : undefined"
          color="neutral"
          variant="outline"
          class="flex-col items-start gap-0 text-start"
          @click="book($event, p)"
        >
          <span class="font-semibold">{{ dayBrief(p.startsAt) }}</span>
          <span class="text-xs text-muted">{{ [time(p.startsAt), note(p.booking)].filter(Boolean).join(' · ') }}</span>
          <span class="sr-only">{{ t('public-site.booking.book') }}{{ t('public-site.booking.for', { when: dateTime(p.startsAt) }) }}<template v-if="p.booking!.external">{{ t('public-site.booking.new-tab') }}</template></span>
        </UButton>
        <span
          v-else
          class="flex flex-col rounded-md px-2.5 py-1.5 text-sm ring ring-default ring-inset opacity-60"
        >
          <span class="font-semibold">{{ dayBrief(p.startsAt) }}</span>
          <span class="text-xs text-muted">{{ [time(p.startsAt), note(p.booking)].filter(Boolean).join(' · ') }}</span>
        </span>
      </li>
      <li
        v-if="rest > 0"
        class="self-center"
      >
        <ULink
          :to="more"
          class="text-sm font-medium text-primary hover:underline"
        >
          {{ t('public-site.whats-on.more-dates', { count: rest }) }}
        </ULink>
      </li>
    </ul>
    <PublicSiteBookingDrawer
      v-if="drawn"
      v-model:open="open"
      :name="drawn.booking.drawer!"
      :link="drawn.booking.link!"
      :title="title"
      :when="dateTime(drawn.startsAt)"
    />
  </div>
</template>
