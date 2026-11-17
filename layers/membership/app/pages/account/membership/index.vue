<!-- My membership (MEM-10, MEM-11, MEM-33): what the person holds and until when, their member
     number, and the schemes they can join. A free scheme with nothing to check is joined here in one
     step, as is one that checks a list (a student ID, or a verified address); other schemes say how to
     join until applications are built. -->
<script setup lang="ts">
interface Mine { number: { label: string, since: string } | null, memberships: { id: string, schemeId: string, schemeName: string, side: string, length: string | null, startsOn: string, endsOn: string | null, status: 'upcoming' | 'current' | 'in-grace' | 'lapsed' }[] }
interface Offered { id: string, name: string, summary: string | null, joinMode: string, options: { id: string, name: string }[], asksFor: string | null }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()
const mine = await useAPI<Mine>('/api/membership/mine', { key: 'membership:mine' })
const offered = await useAPI<{ schemes: Offered[] }>('/api/membership/schemes', { key: 'membership:offered' })

const TONE = { 'upcoming': 'info', 'current': 'success', 'in-grace': 'warning', 'lapsed': 'neutral' } as const
const held = computed(() => new Set((mine.data.value?.memberships ?? []).filter(m => m.status !== 'lapsed').map(m => m.schemeId)))
const joinable = computed(() => (offered.data.value?.schemes ?? []).filter(s => !held.value.has(s.id)))
const chosen = reactive<Record<string, string | undefined>>({})
const references = reactive<Record<string, string>>({})

async function join(s: Offered) {
  try {
    await $api(`/api/membership/schemes/${s.id}/join` as string, { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: { lengthOptionId: chosen[s.id] ?? (s.options.length === 1 ? s.options[0]!.id : null), reference: s.asksFor ? references[s.id]?.trim() : undefined } })
    toast.add({ title: t('membership.screens.mine.joined', { scheme: s.name }), color: 'success' })
    // A members' scheme opens the members' area from this response on: reload so the header shows it.
    reloadNuxtApp()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
}
</script>

<template>
  <PageFrame
    :title="t('membership.navigation.mine.label')"
    width="reading"
  >
    <DataBoundary
      :data="mine.data.value"
      :status="mine.status.value"
      :error="mine.error.value"
      @retry="mine.refresh()"
    >
      <div class="space-y-6">
        <PageSection
          v-if="mine.data.value?.memberships.length"
          :title="t('membership.screens.mine.held')"
        >
          <FactStrip
            v-if="mine.data.value.number"
            :facts="[{ label: t('membership.screens.mine.number'), value: mine.data.value.number.label }, { label: t('membership.screens.mine.since'), value: day(mine.data.value.number.since) }]"
          />
          <RecordList :label="t('membership.screens.mine.held')">
            <RecordListItem
              v-for="m in mine.data.value.memberships"
              :key="m.id"
              :name="m.schemeName"
              :description="m.endsOn ? t('membership.screens.mine.until', { date: day(m.endsOn) }) : t('membership.screens.mine.no-end')"
              :muted="m.status === 'lapsed'"
            >
              <StatusBadge
                :tone="TONE[m.status]"
                :label="t(`membership.screens.derived.${m.status}`)"
              />
            </RecordListItem>
          </RecordList>
        </PageSection>

        <PageSection
          :title="t('membership.screens.mine.join-title')"
        >
          <p
            v-if="!joinable.length"
            class="text-muted"
          >
            {{ t('membership.screens.mine.nothing-to-join') }}
          </p>
          <RecordList
            v-else
            :label="t('membership.screens.mine.join-title')"
          >
            <RecordListItem
              v-for="s in joinable"
              :key="s.id"
              :name="s.name"
              :description="s.summary ?? undefined"
            >
              <span
                v-if="s.joinMode === 'staff-only'"
                class="text-sm text-muted"
              >{{ t('membership.screens.mine.staff-only') }}</span>
              <template v-else>
                <USelect
                  v-if="s.options.length > 1"
                  v-model="chosen[s.id]"
                  :items="s.options.map(o => ({ value: o.id, label: o.name }))"
                  :placeholder="t('membership.screens.mine.choose-length')"
                  :aria-label="t('membership.screens.mine.length-for', { scheme: s.name })"
                />
                <UInput
                  v-if="s.asksFor"
                  v-model="references[s.id]"
                  :placeholder="s.asksFor"
                  :aria-label="s.asksFor"
                  autocomplete="off"
                  maxlength="254"
                />
                <UButton
                  :label="t('membership.screens.mine.join')"
                  :disabled="(s.options.length > 1 && !chosen[s.id]) || (!!s.asksFor && !references[s.id]?.trim())"
                  loading-auto
                  @click="join(s)"
                />
              </template>
            </RecordListItem>
          </RecordList>
        </PageSection>
      </div>
    </DataBoundary>
  </PageFrame>
</template>
