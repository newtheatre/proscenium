<!-- Handing out T-shirts and meals for one crew call (FH-50): search a name, see what they have
     earned and had, and one large button for each thing still to hand over. A second handout is
     refused naming who gave the first (HO1); one not yet earned goes ahead with a warning (HO2);
     Undo is on the toast and beside each handout. -->
<script setup lang="ts">
interface Standing { id: string, item: 'tshirt' | 'meal', day: string | null, size: string | null, at: number }
interface Person { accountId: string, name: string, shifts: number, answered: boolean, tshirt: boolean, size: string | null, mealDays: string[], handed: Standing[] }
interface Handouts {
  call: { id: string, name: string, startsOn: string, endsOn: string, state: string, tshirts: boolean, meals: boolean }
  today: string
  people: Person[]
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const dates = useDates()
const route = useRoute()
const id = computed(() => String(route.params.call))
const path = computed(() => `/api/front-of-house/crew-calls/${encodeURIComponent(id.value)}/handouts`)
const { data, status, error, refresh } = await useAPI<Handouts>(() => path.value, { key: `front-of-house:handouts:${id.value}` })

const search = ref('')
const picked = ref<string | null>(null)
const matching = computed(() => {
  const words = search.value.trim().toLowerCase()
  return (data.value?.people ?? []).filter(p => !words || p.name.toLowerCase().includes(words))
})
const person = computed(() => data.value?.people.find(p => p.accountId === picked.value) ?? null)
// The meal button is for today when today is one of the call's days; otherwise the day is chosen.
const days = computed(() => {
  const c = data.value?.call
  if (!c) return []
  const out: string[] = []
  for (let d = new Date(`${c.startsOn}T12:00:00Z`); d.toISOString().slice(0, 10) <= c.endsOn; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10)) // not-policy: a date's length
  return out
})
const day = ref<string | undefined>()
watch(data, (d) => {
  if (d && !day.value) day.value = days.value.includes(d.today) ? d.today : days.value[0]
}, { immediate: true })
const dayItems = computed(() => days.value.map(d => ({ value: d, label: d === data.value?.today ? t('front-of-house.handouts.today') : dates.dayNamed(d) })))

const shirt = computed(() => person.value?.handed.find(h => h.item === 'tshirt') ?? null)
const meal = computed(() => person.value?.handed.find(h => h.item === 'meal' && h.day === day.value) ?? null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

async function undo(handoutId: string) {
  await write(`${path.value}/${encodeURIComponent(handoutId)}/undo`, { method: 'POST', body: {} })
  toast.add({ title: t('front-of-house.handouts.undone'), color: 'neutral' })
  await refresh()
}
async function hand(item: 'tshirt' | 'meal') {
  const p = person.value
  if (!p) return
  refusal.value = null
  try {
    const done = await write<{ handoutId: string, earned: boolean }>(path.value, { method: 'POST', body: { accountId: p.accountId, item, ...(item === 'meal' ? { day: day.value } : { size: p.size }) } })
    toast.add({
      title: t(`front-of-house.handouts.done.${item}`, { name: p.name }),
      description: done.earned ? undefined : t('front-of-house.handouts.not-earned'),
      color: done.earned ? 'success' : 'warning',
      actions: [{ label: t('core.undo.button'), icon: 'i-lucide-undo-2', color: 'neutral', variant: 'outline', onClick: () => { void undo(done.handoutId) } }],
    })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    await refresh()
  }
}
</script>

<template>
  <PageLive
    :title="t('front-of-house.handouts.title')"
    :context="data?.call.name"
    back="/live/front-of-house/handouts"
  >
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default="{ data: d }">
        <div class="mx-auto max-w-3xl space-y-6">
          <RefusalNotice :refusal="refusal" />
          <div
            v-if="person"
            class="space-y-4"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-xl font-semibold text-highlighted">
                  {{ person.name }}
                </h2>
                <p class="text-sm text-muted">
                  {{ t('front-of-house.crew-calls.shifts-count', { count: person.shifts }) }}
                </p>
              </div>
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-search"
                :label="t('front-of-house.handouts.someone-else')"
                @click="picked = null"
              />
            </div>
            <template v-if="d.call.tshirts">
              <UButton
                v-if="!shirt"
                size="xl"
                block
                icon="i-lucide-shirt"
                :color="person.tshirt ? 'primary' : 'neutral'"
                :variant="person.tshirt ? 'solid' : 'outline'"
                :label="person.size ? t('front-of-house.handouts.hand-tshirt-size', { size: person.size }) : t('front-of-house.handouts.hand-tshirt')"
                loading-auto
                @click="hand('tshirt')"
              />
              <div
                v-else
                class="flex items-center justify-between gap-3 rounded-md border border-default p-3"
              >
                <span>{{ t('front-of-house.handouts.had-tshirt', { size: shirt.size ?? '', time: dates.time(shirt.at) }) }}</span>
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-undo-2"
                  :label="t('core.undo.button')"
                  loading-auto
                  @click="undo(shirt.id)"
                />
              </div>
              <p
                v-if="!person.tshirt && !shirt"
                class="text-sm text-muted"
              >
                {{ t('front-of-house.handouts.tshirt-not-earned') }}
              </p>
            </template>
            <template v-if="d.call.meals">
              <UFormField :label="t('front-of-house.handouts.day')">
                <USelect
                  v-model="day"
                  :items="dayItems"
                  value-key="value"
                />
              </UFormField>
              <UButton
                v-if="!meal"
                size="xl"
                block
                icon="i-lucide-utensils"
                :color="person.mealDays.includes(day ?? '') ? 'primary' : 'neutral'"
                :variant="person.mealDays.includes(day ?? '') ? 'solid' : 'outline'"
                :label="day === d.today ? t('front-of-house.handouts.meal-today') : t('front-of-house.handouts.meal-on', { day: dates.dayNamed(day ?? d.today) })"
                loading-auto
                @click="hand('meal')"
              />
              <div
                v-else
                class="flex items-center justify-between gap-3 rounded-md border border-default p-3"
              >
                <span>{{ t('front-of-house.handouts.had-meal', { time: dates.time(meal.at) }) }}</span>
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-undo-2"
                  :label="t('core.undo.button')"
                  loading-auto
                  @click="undo(meal.id)"
                />
              </div>
              <p
                v-if="!meal && !person.mealDays.includes(day ?? '')"
                class="text-sm text-muted"
              >
                {{ t('front-of-house.handouts.meal-not-earned') }}
              </p>
            </template>
          </div>
          <template v-else>
            <UInput
              v-model="search"
              size="xl"
              icon="i-lucide-search"
              :placeholder="t('front-of-house.handouts.search')"
              :aria-label="t('front-of-house.handouts.search')"
              autofocus
            />
            <RecordList
              v-if="matching.length"
              :label="t('front-of-house.crew-calls.tab.crew')"
            >
              <RecordListItem
                v-for="p in matching"
                :key="p.accountId"
                icon="i-lucide-user"
                :name="p.name"
                :description="t('front-of-house.crew-calls.shifts-count', { count: p.shifts })"
                @click="picked = p.accountId"
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  :label="t('front-of-house.handouts.choose')"
                  :aria-label="t('front-of-house.handouts.choose-named', { name: p.name })"
                  @click="picked = p.accountId"
                />
              </RecordListItem>
            </RecordList>
            <EmptyState
              v-else
              icon="i-lucide-users-round"
              :title="t('front-of-house.handouts.nobody.title')"
              :description="t('front-of-house.handouts.nobody.description')"
            />
          </template>
        </div>
      </template>
    </DataBoundary>
  </PageLive>
</template>
