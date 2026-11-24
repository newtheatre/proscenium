<!-- Find a time (S7, AV-11 to AV-13): choose groups, dates, hours, a length and rooms; see the best
     times and a grid of how many are free; choose a slot to see who is where, and who must come. -->
<script setup lang="ts">
import { z } from 'zod'
import { clockOf, DAY_MINUTES, rowStarts } from '../../../../shared/grid'
import { minutesOf, type ShownLevel } from '../../../../shared/levels'
import { SLOTS_MAX, SLOTS_MIN } from '../../../../shared/find'
import type { PollRow } from '../../../composables/usePolls'

const { t } = useT()
const dates = useDates()
const f = await useFindATime()
const { options, choices, found, refusal, searching, shown, picked } = f
const words = usePollWords()
const sent = await useAPI<{ polls: PollRow[] }>('/api/availability/polls/sent', { key: 'availability:polls-sent' })
const sending = ref(false)
const schema = z.object({
  groupIds: z.array(z.string()).min(1, t('availability.sent.groups-needed')),
  period: z.object({ start: z.string().min(1, t('availability.find.dates-needed')), end: z.string().min(1, t('availability.find.dates-needed')) }),
  hoursFrom: z.string(),
  hoursTo: z.string(),
}).refine(v => v.hoursTo > v.hoursFrom, { path: ['hoursTo'], message: t('availability.entry.until-after') })
const chosen = ref<{ date: string, start: number, end: number } | null>(null)

const step = computed(() => options.data.value?.grid.step ?? 30) // not-policy: shown only before options load
const times = computed(() => rowStarts(step.value).map(m => ({ label: clockOf(m), value: clockOf(m) })))
const ends = computed(() => [...rowStarts(step.value).slice(1), DAY_MINUTES].map(m => ({ label: clockOf(m), value: clockOf(m) })))
const LENGTHS = [30, 60, 90, 120, 150, 180, 240, 300, 360] // not-policy: lengths offered, in minutes
const lengths = computed(() => LENGTHS.filter(m => m % step.value === 0).map(m => ({ value: m, label: t('availability.find.length-minutes', { hours: Math.floor(m / 60), minutes: m % 60 }) }))) // not-policy: minutes in an hour
const groups = computed(() => (options.data.value?.groups ?? []).map(g => ({ value: g.id, label: g.label, description: g.hint })))
const spaces = computed(() => (options.data.value?.venues ?? []).flatMap(v => v.spaces.map(s => ({ value: s.id, label: v.spaces.length > 1 ? `${v.name}: ${s.name}` : v.name }))))
const hours = computed(() => ({ start: minutesOf(choices.hoursFrom), end: minutesOf(choices.hoursTo) }))
const ORDER: ShownLevel[] = ['free', 'maybe', 'busy', 'unknown']
const who = computed(() => chosen.value && found.value ? f.at(chosen.value.date, chosen.value.start, chosen.value.end) : null)
const takenHere = computed(() => chosen.value ? f.takenAt(chosen.value.date, chosen.value.start, chosen.value.end) : [])

function choose(slot: { date: string, start: number, end: number }) {
  chosen.value = slot
}
async function find() {
  chosen.value = null
  if (picked.value.some(p => p.end - p.start !== choices.length)) picked.value = []
  await f.search()
}
async function sentPoll(id: string) {
  sending.value = false
  picked.value = []
  await navigateTo(`/members/find-a-time/${id}`)
}
const pollLine = (p: PollRow) => t('availability.poll.sent-line', { answered: p.answered, asked: p.asked, due: dates.dateTime(p.answersBy) })
</script>

<template>
  <PageFrame
    :title="t('availability.find.title')"
    :description="t('availability.find.description')"
    width="full"
  >
    <template #primary>
      <UButton
        to="/members/find-a-time/requests"
        icon="i-lucide-send"
        color="neutral"
        variant="outline"
        :label="t('availability.sent.title')"
      />
    </template>
    <DataBoundary
      :data="options.data.value"
      :status="options.status.value"
      :error="options.error.value"
      @retry="options.refresh()"
    >
      <template #default="{ data: o }">
        <EmptyState
          v-if="!o.groups.length"
          icon="i-lucide-users"
          :title="t('availability.sent.no-groups')"
          :description="t('availability.sent.no-groups-help')"
        />
        <div
          v-else
          class="grid gap-6 lg:grid-cols-[20rem_1fr]"
        >
          <UForm
            :schema="schema"
            :state="choices"
            class="space-y-4"
            novalidate
            @submit="find"
          >
            <UFormField
              :label="t('availability.sent.groups')"
              name="groupIds"
              required
            >
              <USelectMenu
                v-model="choices.groupIds"
                :items="groups"
                value-key="value"
                multiple
                :placeholder="t('availability.sent.groups-choose')"
              />
            </UFormField>
            <UFormField
              :label="t('availability.find.dates')"
              :help="t('availability.find.dates-help')"
              name="period"
              required
            >
              <FieldDateRange
                v-model="choices.period"
                :min="o.today"
              />
            </UFormField>
            <div class="flex gap-3">
              <UFormField :label="t('availability.find.from')">
                <USelect
                  v-model="choices.hoursFrom"
                  :items="times"
                  class="w-28"
                />
              </UFormField>
              <UFormField
                :label="t('availability.find.until')"
                name="hoursTo"
              >
                <USelect
                  v-model="choices.hoursTo"
                  :items="ends"
                  class="w-28"
                />
              </UFormField>
            </div>
            <UFormField :label="t('availability.find.length')">
              <USelect
                v-model="choices.length"
                :items="lengths"
              />
            </UFormField>
            <UFormField
              v-if="spaces.length"
              :label="t('availability.find.rooms')"
              :hint="t('availability.entry.optional')"
            >
              <USelectMenu
                v-model="choices.spaceIds"
                :items="spaces"
                value-key="value"
                multiple
                :placeholder="t('availability.find.rooms-choose')"
              />
            </UFormField>
            <UCheckbox
              v-if="choices.spaceIds.length"
              v-model="choices.roomOptional"
              :label="t('availability.find.room-optional')"
              :description="t('availability.find.room-optional-help')"
            />
            <RefusalNotice :refusal="refusal" />
            <UButton
              type="submit"
              icon="i-lucide-search"
              :label="t('availability.find.find')"
              :loading="searching"
            />
          </UForm>

          <div class="min-w-0 space-y-6">
            <template v-if="!found">
              <EmptyState
                icon="i-lucide-calendar-search"
                :title="t('availability.find.start')"
                :description="t('availability.find.start-help')"
              />
              <PageSection
                v-if="sent.data.value?.polls.length"
                :title="t('availability.poll.mine')"
              >
                <RecordList flush>
                  <RecordListItem
                    v-for="p in sent.data.value.polls"
                    :key="p.id"
                    :to="`/members/find-a-time/${p.id}`"
                    icon="i-lucide-vote"
                    :name="p.title"
                    :description="pollLine(p)"
                    :muted="!p.open"
                  >
                    <StatusBadge
                      :tone="words.stateTone(p.state)"
                      :label="words.state(p)"
                    />
                  </RecordListItem>
                </RecordList>
              </PageSection>
            </template>
            <template v-else>
              <UCard
                v-if="picked.length"
                :ui="{ body: 'space-y-3' }"
              >
                <h2 class="font-semibold text-highlighted">
                  {{ t('availability.poll.picked', { count: picked.length }) }}
                </h2>
                <ul class="flex flex-wrap gap-2">
                  <li
                    v-for="s in picked"
                    :key="`${s.date}-${s.start}`"
                  >
                    <UBadge
                      color="neutral"
                      variant="subtle"
                      size="lg"
                    >
                      {{ words.when(s) }}
                      <IconButton
                        icon="i-lucide-x"
                        :label="t('availability.poll.unpick', { when: words.when(s) })"
                        size="xs"
                        @click="f.pick(s)"
                      />
                    </UBadge>
                  </li>
                </ul>
                <div class="flex flex-wrap items-center gap-3">
                  <UButton
                    icon="i-lucide-send"
                    :label="t('availability.poll.send')"
                    :disabled="picked.length < SLOTS_MIN"
                    @click="sending = true"
                  />
                  <span
                    v-if="picked.length < SLOTS_MIN"
                    class="text-sm text-muted"
                  >{{ t('availability.poll.pick-more', { count: SLOTS_MIN }) }}</span>
                </div>
              </UCard>
              <p
                v-if="found.hidden"
                class="text-sm text-muted"
              >
                {{ t('availability.find.hidden', { count: found.hidden }) }}
              </p>
              <PageSection
                :title="t('availability.find.best')"
                :description="t('availability.find.best-help')"
              >
                <EmptyState
                  v-if="!found.best.length"
                  icon="i-lucide-calendar-x"
                  :title="t('availability.find.no-best')"
                  :description="t('availability.find.no-best-help')"
                />
                <RecordList
                  v-else
                  flush
                >
                  <RecordListItem
                    v-for="s in found.best"
                    :key="`${s.date}-${s.start}`"
                    icon="i-lucide-clock"
                    :name="`${dates.dayNamed(s.date)}, ${f.when(s)}`"
                    :description="t('availability.find.best-line', { free: s.free, total: found.people.length, maybe: s.maybe, unknown: s.unknown })"
                  >
                    <template #trailing>
                      <UButton
                        :label="t('availability.find.who')"
                        color="neutral"
                        variant="ghost"
                        @click="choose(s)"
                      />
                      <UButton
                        :label="f.isPicked(s) ? t('availability.poll.picked-one') : t('availability.poll.pick')"
                        :icon="f.isPicked(s) ? 'i-lucide-check' : 'i-lucide-plus'"
                        :aria-pressed="f.isPicked(s)"
                        :disabled="!f.isPicked(s) && picked.length >= SLOTS_MAX"
                        color="neutral"
                        variant="outline"
                        @click="f.pick(s)"
                      />
                    </template>
                  </RecordListItem>
                </RecordList>
              </PageSection>
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <IconButton
                    icon="i-lucide-chevron-left"
                    :label="t('availability.mine.earlier')"
                    :disabled="f.first.value === 0"
                    @click="f.move(-1)"
                  />
                  <IconButton
                    icon="i-lucide-chevron-right"
                    :label="t('availability.mine.later')"
                    :disabled="f.first.value + shown.length >= found.dates.length"
                    @click="f.move(1)"
                  />
                  <h2
                    class="text-lg font-semibold"
                    aria-live="polite"
                  >
                    {{ shown.length ? dates.range(shown[0]!, shown.at(-1)!) : '' }}
                  </h2>
                </div>
                <AvailabilityFindGrid
                  :dates="shown"
                  :step="found.step"
                  :hours="hours"
                  :total="found.people.length"
                  :counts="f.counts"
                  :must-fails="f.mustFails"
                  :taken="f.takenAt"
                  :chosen="chosen"
                  @choose="choose"
                />
                <p class="text-sm text-muted">
                  {{ t('availability.find.key') }}
                </p>
              </div>
              <PageSection
                :title="t('availability.find.people')"
                :description="t('availability.find.people-help')"
              >
                <ul class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <li
                    v-for="p in found.people"
                    :key="p.id"
                  >
                    <UCheckbox
                      :model-value="choices.must.includes(p.id)"
                      :label="p.name || t('availability.sent.former')"
                      :description="t('availability.find.must')"
                      @update:model-value="f.toggleMust(p.id)"
                    />
                  </li>
                </ul>
              </PageSection>
            </template>
          </div>
        </div>
      </template>
    </DataBoundary>
    <USlideover
      :open="!!chosen"
      :title="chosen ? `${dates.dayNamed(chosen.date)}, ${f.when(chosen)}` : ''"
      :description="t('availability.find.who-help')"
      @update:open="v => { if (!v) chosen = null }"
    >
      <template #body>
        <div
          v-if="who && chosen"
          class="space-y-5"
        >
          <UButton
            :label="f.isPicked(chosen) ? t('availability.poll.picked-one') : t('availability.poll.pick')"
            :icon="f.isPicked(chosen) ? 'i-lucide-check' : 'i-lucide-plus'"
            :aria-pressed="f.isPicked(chosen)"
            :disabled="!f.isPicked(chosen) && picked.length >= SLOTS_MAX"
            color="neutral"
            variant="outline"
            @click="f.pick(chosen)"
          />
          <UAlert
            v-for="(s, i) in takenHere"
            :key="i"
            :title="t('availability.find.room-taken-at', { when: f.when(s), what: s.label ?? t('availability.find.room-busy') })"
            icon="i-lucide-door-closed"
            color="warning"
            variant="subtle"
          />
          <section
            v-for="level in ORDER"
            :key="level"
            :aria-labelledby="`find-${level}`"
          >
            <h3
              :id="`find-${level}`"
              class="text-sm font-semibold text-highlighted"
            >
              {{ t(`availability.levels.${level}`) }} ({{ who[level].length }})
            </h3>
            <p
              v-if="!who[level].length"
              class="text-sm text-muted"
            >
              {{ t('availability.find.nobody') }}
            </p>
            <ul
              v-else
              class="mt-1 space-y-0.5 text-sm"
            >
              <li
                v-for="(p, i) in who[level]"
                :key="i"
              >
                {{ p.name || t('availability.sent.former') }}<em
                  v-if="p.reason"
                  class="text-muted"
                >, {{ p.reason }}</em>
              </li>
            </ul>
          </section>
        </div>
      </template>
    </USlideover>
    <UModal
      v-model:open="sending"
      :title="t('availability.poll.send')"
      :description="t('availability.poll.send-help')"
    >
      <template #body>
        <AvailabilityPollForm
          :choices="choices"
          :slots="picked"
          :today="options.data.value?.today ?? ''"
          @sent="sentPoll"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
