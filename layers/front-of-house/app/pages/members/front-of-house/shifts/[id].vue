<!-- One shift, as a member sees it (Front of house specification, part 5, "Members' area"): the
     performance, venue, duty, call and end, the briefing and who else is on. The one action follows
     the person's place: sign up, withdraw, give it up (the notice rule said before confirming), keep
     it, take someone's place who needs cover, or "I'm here" inside the window. -->
<script setup lang="ts">
interface ShiftView {
  id: string
  performanceId: string | null
  title: string | null
  dutyName: string
  dutyDescription: string | null
  productionTitle: string | null
  venueName: string | null
  places: number
  placesTaken: number
  callAt: number
  endsAt: number
  windowOpensAt: number
  windowClosesAt: number
  signUpClosesAt: number | null
  briefing: string | null
  state: 'draft' | 'published' | 'completed' | 'cancelled'
  releaseNotice: number
  curtainAt: number | null
  people: { name: string, state: string }[]
  mine: { assignmentId: string, state: string, calendar: string, freeRelease: boolean } | null
  clash: { shiftId: string, dutyName: string, productionTitle: string | null, title: string | null, callAt: number, endsAt: number } | null
  coverFor: string | null
  questionsFirst: { crewCallId: string, name: string } | null
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { dateTime, time, dayNamed } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data, status, error, refresh } = await useAPI<ShiftView>(() => `/api/front-of-house/shifts/${encodeURIComponent(id.value)}`, { key: `front-of-house:shift:${id.value}` })

const TONES: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  requested: 'info', confirmed: 'success', checked_in: 'success', release_requested: 'warning',
}
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const now = ref(Date.now())
onMounted(() => {
  const timer = setInterval(() => now.value = Date.now(), 30_000) // not-policy: how often the window is looked at again
  onBeforeUnmount(() => clearInterval(timer))
})

async function act(path: string, body: Record<string, unknown>, done: string) {
  refusal.value = null
  try {
    await write(path, { method: 'POST', body })
    toast.add({ title: done, color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const nameOf = (s: { dutyName: string, productionTitle: string | null, title: string | null }) =>
  s.productionTitle ? t('front-of-house.shift.of-show', { duty: s.dutyName, show: s.productionTitle }) : s.title ? t('front-of-house.shift.of-occasion', { duty: s.dutyName, title: s.title }) : s.dutyName
const name = computed(() => (data.value ? nameOf(data.value) : ''))
// The notice rule in the words a person thinks in: days from two days up, else hours.
const noticeLabel = computed(() => {
  const hours = Math.round((data.value?.releaseNotice ?? 0) / 3600) // not-policy: seconds in an hour
  return hours >= 48 ? t('front-of-house.shift.notice.days', { count: Math.round(hours / 24) }) : t('front-of-house.shift.notice.hours', { count: hours }) // not-policy: hours in a day, and when days read better
})
// Inside the window the shift is about to start or has: someone who can't come says so, and managers are told.
const inWindow = computed(() => !!data.value && now.value >= data.value.windowOpensAt && now.value <= data.value.windowClosesAt)
const clashName = computed(() => (data.value?.clash ? t('front-of-house.shift.clash', { shift: nameOf(data.value.clash), when: dateTime(data.value.clash.callAt) }) : null))
async function giveUp() {
  const s = data.value!
  const free = s.mine!.freeRelease || s.callAt - now.value > s.releaseNotice * 1000 // not-policy: seconds to milliseconds
  const date = dayNamed(s.callAt)
  const consequence = s.mine!.freeRelease
    ? t('front-of-house.shift.give-up.changed', { date })
    : free
      ? t('front-of-house.shift.give-up.early', { date, notice: noticeLabel.value })
      : inWindow.value
        ? t('front-of-house.shift.give-up.now')
        : t('front-of-house.shift.give-up.late', { date, notice: noticeLabel.value })
  if (!await confirm({
    verb: t('front-of-house.shift.give-up.verb'),
    thing: t('front-of-house.shift.give-up.thing', { shift: name.value }),
    consequence,
    button: t('front-of-house.shift.give-up.button'),
  })) return
  await act(`/api/front-of-house/assignments/${encodeURIComponent(s.mine!.assignmentId)}/release`, {}, t(free ? 'front-of-house.shift.give-up.done' : 'front-of-house.shift.give-up.asked'))
}

type Action = { label: string, icon: string, run?: () => Promise<void>, href?: string, to?: string, disabled?: boolean }
const LIVE = ['confirmed', 'release_requested', 'checked_in']
// The one main action. Giving up is never it: that is the quieter button beside the details.
const primary = computed<Action | null>(() => {
  const s = data.value
  if (!s || s.state !== 'published') return null
  const mine = s.mine
  const assignment = (action: string) => `/api/front-of-house/assignments/${encodeURIComponent(mine!.assignmentId)}/${action}`
  if (mine && inWindow.value && (mine.state === 'confirmed' || mine.state === 'release_requested'))
    return { label: t('front-of-house.shift.check-in'), icon: 'i-lucide-map-pin-check', run: () => act(assignment('check-in'), {}, t('front-of-house.shift.checked-in')) }
  if (mine?.state === 'release_requested')
    return { label: t('front-of-house.shift.keep'), icon: 'i-lucide-calendar-check', run: () => act(assignment('keep'), {}, t('front-of-house.shift.kept')) }
  if (mine && LIVE.includes(mine.state))
    return { label: t('front-of-house.shift.add-to-calendar'), icon: 'i-lucide-calendar-plus', href: mine.calendar }
  if (!mine && s.coverFor)
    return { label: t('front-of-house.shift.take-cover'), icon: 'i-lucide-hand-helping', disabled: !!s.clash, run: () => act(`/api/front-of-house/assignments/${encodeURIComponent(s.coverFor!)}/cover`, {}, t('front-of-house.shift.taken')) }
  const open = !mine && s.placesTaken < s.places && s.signUpClosesAt !== null && s.signUpClosesAt > now.value
  // A crew call's questions come before its shifts (CC1): the way to them takes sign-up's place.
  if (open && s.questionsFirst)
    return { label: t('front-of-house.crew-calls.answer-first'), icon: 'i-lucide-clipboard-list', to: `/members/front-of-house/crew-calls/${encodeURIComponent(s.questionsFirst.crewCallId)}` }
  if (open)
    return { label: t('front-of-house.shift.sign-up'), icon: 'i-lucide-calendar-plus', disabled: !!s.clash, run: () => act(`/api/front-of-house/shifts/${encodeURIComponent(s.id)}/sign-up`, {}, t('front-of-house.shift.signed-up')) }
  return null
})
const secondary = computed<Action | null>(() => {
  const s = data.value
  if (!s || s.state !== 'published' || !s.mine) return null
  if (s.mine.state === 'requested')
    return { label: t('front-of-house.shift.withdraw'), icon: 'i-lucide-undo-2', run: () => act(`/api/front-of-house/assignments/${encodeURIComponent(s.mine!.assignmentId)}/release`, {}, t('front-of-house.shift.withdrawn')) }
  if (s.mine.state === 'confirmed')
    return { label: t(inWindow.value ? 'front-of-house.shift.cant-come' : 'front-of-house.shift.give-up.button'), icon: 'i-lucide-calendar-x', run: giveUp }
  return null
})

// On the night, the way from the shift to the screens it is worked from.
const board = computed(() => {
  const s = data.value
  return s?.state === 'published' && s.performanceId && s.mine && LIVE.includes(s.mine.state) && inWindow.value ? `/live/front-of-house/${encodeURIComponent(s.performanceId)}` : null
})
const summary = computed(() => {
  const s = data.value
  if (!s) return []
  return [
    { label: t('front-of-house.shift.duty'), value: s.dutyName },
    ...(s.venueName ? [{ label: t('front-of-house.shift.venue'), value: s.venueName }] : []),
    { label: t('front-of-house.shift.call-at'), value: dateTime(s.callAt) },
    ...(s.curtainAt !== null ? [{ label: t('front-of-house.shift.curtain'), value: time(s.curtainAt) }] : []),
    { label: t('front-of-house.shift.ends-at'), value: time(s.endsAt) },
    { label: t('front-of-house.shift.places'), value: t('front-of-house.shift.places-value', { taken: s.placesTaken, places: s.places }) },
  ]
})
const statusOf = computed(() => {
  const s = data.value
  if (!s) return undefined
  if (s.state === 'cancelled') return { label: t('core.states.cancelled'), tone: 'neutral' as const }
  if (s.mine) return { label: t(`front-of-house.assignment-states.${s.mine.state}`), tone: TONES[s.mine.state] ?? 'neutral' }
  return undefined
})
const trail = computed(() => [{ label: t('front-of-house.navigation.shifts.label'), to: '/members/front-of-house' }])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: s }">
      <PageFrame
        :title="name"
        :trail="trail"
        width="reading"
      >
        <template #status>
          <StatusBadge
            v-if="statusOf"
            :tone="statusOf.tone"
            :label="statusOf.label"
          />
        </template>
        <template #primary>
          <UButton
            v-if="primary?.href"
            :icon="primary.icon"
            :label="primary.label"
            :href="primary.href"
            external
            download
          />
          <UButton
            v-else-if="primary?.to"
            :icon="primary.icon"
            :label="primary.label"
            :to="primary.to"
          />
          <UButton
            v-else-if="primary"
            :icon="primary.icon"
            :label="primary.label"
            :disabled="primary.disabled"
            loading-auto
            @click="primary.run"
          />
        </template>
        <div class="space-y-6">
          <RefusalNotice :refusal="refusal" />
          <UAlert
            v-if="s.questionsFirst && !s.mine"
            color="info"
            variant="subtle"
            icon="i-lucide-clipboard-list"
            :title="t('front-of-house.crew-calls.questions-first', { call: s.questionsFirst.name })"
          />
          <p
            v-if="clashName && !s.mine"
            class="text-sm text-muted"
          >
            {{ clashName }}
          </p>
          <FactStrip :facts="summary" />
          <div
            v-if="secondary || board"
            class="flex flex-wrap gap-3"
          >
            <UButton
              v-if="board"
              color="neutral"
              variant="outline"
              icon="i-lucide-drama"
              :to="board"
              :label="t('front-of-house.shift.open-board')"
            />
            <UButton
              v-if="secondary"
              color="neutral"
              variant="outline"
              :icon="secondary.icon"
              :label="secondary.label"
              loading-auto
              @click="secondary.run"
            />
          </div>
          <PageSection
            v-if="s.dutyDescription || s.briefing"
            :title="t('front-of-house.shift.about')"
          >
            <div class="space-y-3">
              <p v-if="s.dutyDescription">
                {{ s.dutyDescription }}
              </p>
              <p
                v-if="s.briefing"
                class="whitespace-pre-line"
              >
                {{ s.briefing }}
              </p>
            </div>
          </PageSection>
          <PageSection :title="t(s.mine ? 'front-of-house.shift.who-else-too' : 'front-of-house.shift.who-else')">
            <p
              v-if="!s.people.length"
              class="text-muted"
            >
              {{ t(s.mine ? 'front-of-house.shift.nobody-else-yet' : 'front-of-house.shift.nobody-yet') }}
            </p>
            <RecordList
              v-else
              :label="t(s.mine ? 'front-of-house.shift.who-else-too' : 'front-of-house.shift.who-else')"
            >
              <RecordListItem
                v-for="(p, i) in s.people"
                :key="i"
                icon="i-lucide-user"
                :name="p.name"
              />
            </RecordList>
          </PageSection>
        </div>
      </PageFrame>
    </template>
  </DataBoundary>
</template>
