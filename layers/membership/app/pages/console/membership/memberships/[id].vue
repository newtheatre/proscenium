<!-- One membership (tab 5, "A membership"): the person, scheme, number and status, its dates and how
     it started, every check made on it, and ending it with a note. -->
<script setup lang="ts">
definePageMeta({ layout: 'console' })

interface Detail {
  membership: { id: string, accountId: string, name: string, schemeId: string, schemeName: string, side: string, state: string, status: string, origin: string, lengthName: string | null, startsOn: string | null, endsOn: string | null, endedAt: number | null, endReason: string | null, note: string | null, createdAt: number }
  number: string | null
  checks: { verifier: string, outcome: string, reason: string | null, note: string | null, decidedBy: string | null, createdAt: number }[]
}

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day, dateTime } = useDates()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<Detail>(() => `/api/membership/memberships/${id.value}`, { key: `membership:membership:${id.value}` })
const m = computed(() => data.value?.membership)
const TONES: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = { 'current': 'success', 'in-grace': 'warning', 'upcoming': 'info', 'pending': 'info' }

const facts = computed(() => {
  const x = m.value
  if (!x) return []
  return [
    { label: t('membership.membership.scheme'), value: x.schemeName },
    { label: t('membership.membership.number'), value: data.value?.number ?? '' },
    { label: t('membership.membership.starts'), value: x.startsOn ? day(x.startsOn) : '' },
    { label: t('membership.membership.ends'), value: x.endsOn ? day(x.endsOn) : t('membership.members.no-end') },
    { label: t('membership.membership.origin'), value: t(`membership.membership.origins.${x.origin}`) },
    ...(x.lengthName ? [{ label: t('membership.membership.length'), value: x.lengthName }] : []),
    ...(x.endedAt ? [{ label: t('membership.membership.ended'), value: `${dateTime(x.endedAt)} (${t(`membership.membership.end-reasons.${x.endReason}`)})` }] : []),
  ]
})

const ending = ref(false)
const note = ref('')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function end() {
  refusal.value = null
  try {
    await $api(`/api/membership/memberships/${id.value}/end` as string, { method: 'POST', body: { note: note.value } })
    ending.value = false
    toast.add({ title: t('membership.membership.ended-toast'), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame :title="m?.name ?? t('membership.navigation.members.label')">
    <template
      v-if="m"
      #status
    >
      <StatusBadge
        :tone="TONES[m.status] ?? 'neutral'"
        :label="t(`membership.members.status.${m.status}`)"
      />
    </template>
    <template
      v-if="m && (m.state === 'active' || m.state === 'pending')"
      #primary
    >
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-circle-stop"
        :label="t('membership.membership.end')"
        @click="ending = true; note = ''; refusal = null"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data && m"
        class="space-y-6"
      >
        <FactStrip :facts="facts" />
        <PageSection
          v-if="m.note"
          :title="t('membership.membership.note')"
        >
          <p class="whitespace-pre-line">
            {{ m.note }}
          </p>
        </PageSection>
        <PageSection :title="t('membership.membership.checks')">
          <p
            v-if="!data.checks.length"
            class="text-muted"
          >
            {{ t('membership.membership.no-checks') }}
          </p>
          <RecordList
            v-else
            :label="t('membership.membership.checks')"
          >
            <RecordListItem
              v-for="(c, i) in data.checks"
              :key="i"
              :name="t(`membership.membership.outcomes.${c.outcome}`)"
              :description="[dateTime(c.createdAt), t(`membership.screens.verifiers.${c.verifier}`), c.decidedBy ? t('membership.membership.by', { name: c.decidedBy }) : '', c.note ?? ''].filter(Boolean).join(' · ')"
            />
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="ending"
      :title="t('membership.membership.end-title', { name: m?.name ?? '' })"
    >
      <template #body>
        <UForm
          id="membership-end"
          :state="{ note }"
          class="space-y-4"
          @submit="end"
        >
          <RefusalNotice :refusal="refusal" />
          <p class="text-sm text-muted">
            {{ t('membership.membership.end-consequence') }}
          </p>
          <UFormField
            :label="t('membership.membership.end-note')"
            :help="t('membership.membership.end-note-help')"
            required
          >
            <UTextarea
              v-model="note"
              maxlength="500"
              :rows="2"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-end"
          color="error"
          loading-auto
          :disabled="!note.trim()"
          :label="t('membership.membership.end')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
