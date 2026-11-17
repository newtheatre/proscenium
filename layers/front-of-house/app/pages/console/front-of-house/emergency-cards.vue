<!-- Emergency cards (Front of house specification, part 5, "Console"): one card per venue, with
     what to do in an emergency there, shown large in live mode. Saving it as reviewed tells the
     health check the whole card was read through, not only the line changed. -->
<script setup lang="ts">
interface Card {
  venueId: string
  venueName: string
  body: string
  reviewedOn: string
  updatedAt: number
}
interface Choices {
  venues: { id: string, name: string }[]
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const toast = useToast()
const { day } = useDates()
const { data, status, error, refresh } = await useAPI<{ cards: Card[] }>('/api/front-of-house/emergency-cards', { key: 'front-of-house:emergency-cards' })
const { data: choices } = await useAPI<Choices>('/api/front-of-house/choices', { key: 'front-of-house:choices' })

// Every venue, with its card where it has one.
const venues = computed(() => (choices.value?.venues ?? []).map(v => ({ ...v, card: data.value?.cards.find(c => c.venueId === v.id) ?? null })))
const editing = ref<{ id: string, name: string } | null>(null)
const form = ref({ body: '', reviewed: false })
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

function edit(venue: { id: string, name: string, card: Card | null }) {
  editing.value = { id: venue.id, name: venue.name }
  form.value = { body: venue.card?.body ?? '', reviewed: false }
}
async function save() {
  refusal.value = null
  try {
    await write(`/api/front-of-house/emergency-cards/${encodeURIComponent(editing.value!.id)}`, { method: 'PUT', body: { body: form.value.body.trim(), reviewed: form.value.reviewed } })
    toast.add({ title: t('front-of-house.emergency.saved', { venue: editing.value!.name }), color: 'success' })
    editing.value = null
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame
    :title="t('front-of-house.navigation.emergency-cards.label')"
    :description="t('front-of-house.emergency.description')"
  >
    <div class="space-y-8">
      <RefusalNotice :refusal="refusal" />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <EmptyState
          v-if="!venues.length"
          :title="t('front-of-house.emergency.empty.title')"
          :description="t('front-of-house.emergency.empty.description')"
          icon="i-lucide-siren"
        />
        <RecordList
          v-else
          :label="t('front-of-house.navigation.emergency-cards.label')"
        >
          <RecordListItem
            v-for="venue in venues"
            :key="venue.id"
            icon="i-lucide-siren"
            :name="venue.name"
            :description="venue.card ? t('front-of-house.emergency.reviewed-on', { when: day(venue.card.reviewedOn) }) : t('front-of-house.emergency.no-card')"
          >
            <UButton
              color="neutral"
              variant="outline"
              :label="venue.card ? t('front-of-house.edit') : t('front-of-house.emergency.write')"
              @click="edit(venue)"
            />
          </RecordListItem>
        </RecordList>
      </DataBoundary>

      <PageSection
        v-if="editing"
        :title="t('front-of-house.emergency.edit-title', { venue: editing.name })"
      >
        <UForm
          class="space-y-4"
          :state="form"
          @submit="save"
        >
          <UFormField
            :label="t('front-of-house.emergency.body')"
            :help="t('front-of-house.emergency.body-help')"
            required
          >
            <UTextarea
              v-model="form.body"
              :rows="10"
              maxlength="8000"
            />
          </UFormField>
          <div
            v-if="form.body.trim()"
            class="space-y-2"
          >
            <p class="text-sm font-medium">
              {{ t('front-of-house.emergency.preview') }}
            </p>
            <UCard>
              <p class="text-xl whitespace-pre-line">
                {{ form.body }}
              </p>
            </UCard>
          </div>
          <UCheckbox
            v-model="form.reviewed"
            :label="t('front-of-house.emergency.reviewed')"
            :description="t('front-of-house.emergency.reviewed-help')"
          />
          <div class="flex gap-2">
            <UButton
              type="submit"
              :label="t('front-of-house.save')"
              :disabled="!form.body.trim()"
            />
            <UButton
              color="neutral"
              variant="ghost"
              :label="t('front-of-house.cancel')"
              @click="editing = null"
            />
          </div>
        </UForm>
      </PageSection>
    </div>
  </PageFrame>
</template>
