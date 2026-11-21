<!-- Rota (Front of house specification, part 5, "Rota"): coming performances by date, each with a
     line per duty of places filled of places wanted. Narrowed by venue and "unfilled only", both in
     the address. Ticked performances can have a rota template applied or their drafts published at
     once; a performance in a space the theatre does not manage is marked and skipped. -->
<script setup lang="ts">
interface Line {
  dutyId: string
  duty: string
  places: number
  taken: number
  drafts: number
}
interface Performance {
  id: string
  show: string
  startsAt: number
  venue: string | null
  managed: boolean
  duties: Line[]
}
interface Choices {
  venues: { id: string, name: string }[]
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const { dateTime } = useDates()
const route = useRoute()
const router = useRouter()
const ANY = 'any'

const venue = computed({
  get: () => (route.query.venue as string | undefined) ?? ANY,
  set: v => router.replace({ query: { ...route.query, venue: v === ANY ? undefined : v } }),
})
const unfilled = computed({
  get: () => route.query.unfilled === '1',
  set: v => router.replace({ query: { ...route.query, unfilled: v ? '1' : undefined } }),
})
const query = computed(() => ({ venueId: venue.value === ANY ? undefined : venue.value, unfilled: unfilled.value ? '1' : undefined }))
const { data, status, error, refresh } = await useAPI<{ performances: Performance[] }>('/api/front-of-house/rota', { key: 'front-of-house:rota', query })
const { data: choices } = await useAPI<Choices>('/api/front-of-house/choices', { key: 'front-of-house:choices' })
const { data: templates } = await useAPI<{ templates: { id: string, name: string }[] }>('/api/front-of-house/rota-templates', { key: 'front-of-house:rota-templates', default: () => ({ templates: [] }) })

const venueItems = computed(() => [{ value: ANY, label: t('front-of-house.any-venue') }, ...(choices.value?.venues ?? []).map(v => ({ value: v.id, label: v.name }))])
const templateItems = computed(() => (templates.value?.templates ?? []).map(x => ({ value: x.id, label: x.name })))
const picked = ref<string[]>([])
const template = ref<string | undefined>()
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(() => data.value, () => { picked.value = picked.value.filter(id => data.value?.performances.some(p => p.id === id && p.managed)) })

function toggle(id: string, on: boolean) {
  picked.value = on ? [...new Set([...picked.value, id])] : picked.value.filter(x => x !== id)
}
// Only performances in a space the theatre manages can be ticked.
const pickable = computed(() => (data.value?.performances ?? []).filter(p => p.managed).map(p => p.id))
const allPicked = computed<boolean | 'indeterminate'>(() => {
  if (!picked.value.length) return false
  return pickable.value.every(id => picked.value.includes(id)) ? true : 'indeterminate'
})
function pickAll(on: boolean | 'indeterminate') {
  picked.value = on === true ? [...pickable.value] : []
}
const templateError = ref(false)
async function apply() {
  if (!template.value) {
    templateError.value = true
    return
  }
  refusal.value = null
  try {
    const result = await write<{ added: unknown[], skipped: unknown[] }>(`/api/front-of-house/rota-templates/${encodeURIComponent(template.value!)}/apply`, { method: 'POST', body: { performanceIds: picked.value } })
    if (result.added.length) toast.add({ title: t('front-of-house.rota.applied', { count: result.added.length }), color: 'success' })
    else toast.add({ title: t('front-of-house.rota.nothing-to-add-many'), color: 'info' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function publish() {
  refusal.value = null
  try {
    let count = 0
    for (const id of picked.value) count += (await write<{ published: number }>(`/api/front-of-house/performances/${encodeURIComponent(id)}/shifts/publish`, { method: 'POST', body: {} })).published
    toast.add({ title: t('front-of-house.rota.published', { count }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const lineText = (l: Line) => t('front-of-house.rota.line', { duty: l.duty, taken: l.taken, places: l.places }) + (l.drafts ? ` (${t('front-of-house.rota.drafts', { count: l.drafts })})` : '')
</script>

<template>
  <PageFrame
    :title="t('front-of-house.navigation.rota.label')"
    :description="t('front-of-house.rota.description')"
  >
    <div class="space-y-6">
      <div class="flex flex-wrap items-end gap-4">
        <UFormField :label="t('front-of-house.venue')">
          <USelectMenu
            v-model="venue"
            :items="venueItems"
            value-key="value"
          />
        </UFormField>
        <UCheckbox
          v-model="unfilled"
          :label="t('front-of-house.rota.unfilled')"
        />
      </div>
      <RefusalNotice :refusal="refusal" />
      <PageSection
        v-if="picked.length"
        :title="t('front-of-house.rota.picked', { count: picked.length })"
      >
        <div class="flex flex-wrap items-end gap-3">
          <UFormField
            :label="t('front-of-house.rota.template')"
            :error="templateError ? t('front-of-house.rota.choose-template-first') : undefined"
          >
            <USelectMenu
              v-model="template"
              :items="templateItems"
              value-key="value"
              :placeholder="t('front-of-house.rota.choose-template')"
              @update:model-value="templateError = false"
            />
          </UFormField>
          <UButton
            :label="t('front-of-house.rota.apply')"
            loading-auto
            @click="apply"
          />
          <UButton
            color="neutral"
            variant="outline"
            :label="t('front-of-house.rota.publish')"
            loading-auto
            @click="publish"
          />
        </div>
      </PageSection>
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
          <EmptyState
            v-if="!d.performances.length"
            :title="t('front-of-house.rota.empty.title')"
            :description="t('front-of-house.rota.empty.description')"
            icon="i-lucide-calendar-range"
          />
          <template v-else>
            <UCheckbox
              v-if="pickable.length"
              class="mb-3 px-4"
              size="lg"
              :model-value="allPicked"
              :label="t('front-of-house.rota.pick-all')"
              @update:model-value="pickAll"
            />
            <RecordList :label="t('front-of-house.navigation.rota.label')">
              <!-- The row is not a link, so ticking it never opens it: the performance's name is the link. -->
              <RecordListItem
                v-for="p in d.performances"
                :key="p.id"
                :description="[dateTime(p.startsAt), p.venue].filter(Boolean).join(' · ')"
              >
                <template #leading>
                  <UCheckbox
                    v-if="p.managed"
                    size="lg"
                    :ui="{ base: 'size-6' }"
                    :model-value="picked.includes(p.id)"
                    :aria-label="t('front-of-house.rota.pick', { show: p.show, when: dateTime(p.startsAt) })"
                    @update:model-value="v => toggle(p.id, !!v)"
                  />
                  <span
                    v-else
                    class="size-6 shrink-0"
                  />
                </template>
                <template #name>
                  <ULink
                    :to="`/console/front-of-house/rota/${encodeURIComponent(p.id)}`"
                    class="font-medium text-highlighted hover:underline"
                  >
                    {{ p.show }}
                  </ULink>
                </template>
                <div class="flex items-center gap-3">
                  <StatusBadge
                    v-if="!p.managed"
                    tone="neutral"
                    :label="t('front-of-house.rota.not-our-space')"
                  />
                  <IconButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-chevron-right"
                    :to="`/console/front-of-house/rota/${encodeURIComponent(p.id)}`"
                    :label="t('front-of-house.rota.open', { show: p.show, when: dateTime(p.startsAt) })"
                  />
                </div>
                <template #below>
                  <p
                    v-if="!p.duties.length"
                    class="text-sm text-muted"
                  >
                    {{ t('front-of-house.rota.no-shifts') }}
                  </p>
                  <ul
                    v-else
                    class="space-y-1 text-sm"
                  >
                    <li
                      v-for="l in p.duties"
                      :key="l.dutyId"
                      class="flex items-center gap-3"
                    >
                      <UProgress
                        :model-value="l.taken"
                        :max="l.places"
                        size="sm"
                        class="w-24"
                        :aria-label="lineText(l)"
                        :color="l.taken < l.places ? 'warning' : 'success'"
                      />
                      <span>{{ lineText(l) }}</span>
                    </li>
                  </ul>
                </template>
              </RecordListItem>
            </RecordList>
          </template>
        </template>
      </DataBoundary>
    </div>
  </PageFrame>
</template>
