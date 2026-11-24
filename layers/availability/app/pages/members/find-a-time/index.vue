<!-- Find a time (S7, AV-11 to AV-13): choose groups, dates, hours, a length and rooms; see the best
     times and a grid of how many are free; choose a slot to see who is where, and who must come. -->
<script setup lang="ts">
import { z } from 'zod'
import { clockOf, DAY_MINUTES, rowStarts } from '../../../../shared/grid'
import { minutesOf, type ShownLevel } from '../../../../shared/levels'

const { t } = useT()
const dates = useDates()
const f = await useFindATime()
const { options, choices, found, refusal, searching, shown } = f
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
  await f.search()
}
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
            <EmptyState
              v-if="!found"
              icon="i-lucide-calendar-search"
              :title="t('availability.find.start')"
              :description="t('availability.find.start-help')"
            />
            <template v-else>
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
          v-if="who"
          class="space-y-5"
        >
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
  </PageFrame>
</template>
