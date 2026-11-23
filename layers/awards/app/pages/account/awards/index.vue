<!-- My awards: what the theatre has given the person, with the citation, and their choice of where
     each is listed. Their choice stands over the theatre's default. An award that carries a ticket
     price has a card, opened full screen with a code signed afresh each time, to show a seller. An
     award given before the person ever signed in waits off the roll, and asks them to choose. -->
<script setup lang="ts">
interface Mine { id: string, card: boolean, recipientName: string, typeName: string, awardedOn: string, awardedPrecision: 'day' | 'year', awardedFor: string | null, citation: string | null, visibility: 'public' | 'members' | 'hidden', listingPending: boolean, defaultVisibility: 'public' | 'members' | 'hidden' }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const awardDate = useAwardDate()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ awards: Mine[], nominations: boolean }>('/api/awards/mine', { key: 'awards:mine' })
const visibilities = computed(() => (['public', 'members', 'hidden'] as const).map(v => ({ value: v, label: t(`awards.screens.visibility.${v}`) })))

async function list(award: Mine, visibility: Mine['visibility']) {
  try {
    await $api(`/api/awards/mine/${award.id}/visibility` as string, { method: 'POST', body: { visibility } })
    toast.add({ title: t('awards.screens.mine.listed-toast'), color: 'success' })
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
  await refresh()
}

const showing = ref<Mine | null>(null)
const doorCode = ref<string | null>(null)
async function showCard(award: Mine) {
  showing.value = award
  doorCode.value = null
  try {
    doorCode.value = (await $api<{ doorCode: string }>(`/api/box-office/door-codes/awd/${award.id}` as string)).doorCode
  }
  catch {
    // Box office is off: the card is shown without a code.
  }
}
</script>

<template>
  <PageFrame
    :title="t('awards.navigation.mine.label')"
    :description="t('awards.screens.mine.help')"
    :trail="[{ label: t('core.account.title'), to: '/account' }]"
    width="reading"
  >
    <FormsSlotOpen
      v-if="data?.nominations"
      slot-id="awards.nomination"
    />
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!data?.awards.length"
        icon="i-lucide-award"
        :title="t('awards.screens.mine.none')"
      />
      <div
        v-else
        class="space-y-6"
      >
        <PageSection
          v-for="award in data.awards"
          :key="award.id"
          :title="award.typeName"
          :description="[awardDate(award), award.awardedFor].filter(Boolean).join(' · ')"
        >
          <p
            v-if="award.citation"
            class="whitespace-pre-line"
          >
            {{ award.citation }}
          </p>
          <UButton
            v-if="award.card"
            color="neutral"
            variant="outline"
            icon="i-lucide-qr-code"
            :label="t('awards.screens.mine.show-card')"
            @click="showCard(award)"
          />
          <UAlert
            v-if="award.listingPending"
            color="info"
            variant="subtle"
            icon="i-lucide-award"
            :title="t('awards.screens.mine.pending.title')"
            :description="t(`awards.screens.mine.pending.description.${award.defaultVisibility}`)"
            :actions="[
              { label: t('awards.screens.mine.pending.show'), onClick: () => list(award, award.defaultVisibility) },
              { label: t('awards.screens.mine.pending.keep-off'), color: 'neutral', variant: 'outline', onClick: () => list(award, 'hidden') },
            ]"
          />
          <UFormField
            v-else
            :label="t('awards.screens.mine.listed')"
            :help="t('awards.screens.mine.listed-help')"
          >
            <USelect
              :model-value="award.visibility"
              :items="visibilities"
              @update:model-value="(v: Mine['visibility']) => list(award, v)"
            />
          </UFormField>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      :open="!!showing"
      fullscreen
      :title="showing?.typeName ?? ''"
      @update:open="v => { if (!v) showing = null }"
    >
      <template #body>
        <div
          v-if="showing"
          class="mx-auto flex max-w-sm flex-col items-center gap-4 text-center"
        >
          <p class="text-2xl font-semibold">
            {{ showing.recipientName }}
          </p>
          <FactStrip
            centred
            :facts="[{ label: t('awards.screens.award.awarded-on'), value: awardDate(showing) }]"
          />
          <QrCode
            v-if="doorCode"
            :value="doorCode"
            :label="t('awards.screens.mine.card-code')"
            class="w-72!"
          />
          <p class="text-sm text-muted">
            {{ t(doorCode ? 'core.card.show' : 'core.card.show-no-code') }}
          </p>
        </div>
      </template>
    </UModal>
  </PageFrame>
</template>
