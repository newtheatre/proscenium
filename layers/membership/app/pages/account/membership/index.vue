<!-- My membership (MEM-10, MEM-11, MEM-33): what the person holds and until when, their member
     number, and the schemes they can join. A free scheme with nothing to check is joined here in one
     step, as is one that checks a list (a student ID, or a verified address); other schemes say how to
     join until applications are built. A scheme that requires payment shows its fee, and joining it
     goes on to the Pay page; an application waiting for its fee offers Pay from here. The card (MEM-33, MEM-51) opens full screen with a code that
     Box office signs each time it is opened; without Box office it shows no code. -->
<script setup lang="ts">
interface Mine { card: boolean, applications: { id: string, schemeId: string, schemeName: string, appliedAt: number, waiting: 'staff' | 'payment', charge: { state: string, amountMinor: number, currency: string } | null }[], number: { label: string, since: string } | null, memberships: { id: string, schemeId: string, schemeName: string, side: string, length: string | null, startsOn: string, endsOn: string | null, mayEnd: boolean, renewal: { opensOn: string, closesOn: string, open: boolean } | null, renewed: boolean, status: 'upcoming' | 'current' | 'in-grace' | 'lapsed' }[] }
interface Fee { amountMinor: number, currency: string }
interface Offered { id: string, name: string, summary: string | null, joinMode: string, options: { id: string, name: string, fee: Fee | null }[], fee: Fee | null, requiresPayment: boolean, online: boolean, asksFor: string | null }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()
const mine = await useAPI<Mine>('/api/membership/mine', { key: 'membership:mine' })
const offered = await useAPI<{ schemes: Offered[] }>('/api/membership/schemes', { key: 'membership:offered' })

const TONE = { 'upcoming': 'info', 'current': 'success', 'in-grace': 'warning', 'lapsed': 'neutral' } as const
// Sent here from the members' area, which is for members only: say why, and when theirs ended.
const route = useRoute()
const fromMembersArea = computed(() => route.query.from === 'members')
const lastEnded = computed(() => {
  const all = mine.data.value?.memberships ?? []
  if (all.some(m => m.status !== 'lapsed')) return null
  return all.filter(m => m.status === 'lapsed' && m.endsOn).sort((a, b) => b.endsOn!.localeCompare(a.endsOn!))[0] ?? null
})
const held = computed(() => new Set([...(mine.data.value?.memberships ?? []).filter(m => m.status !== 'lapsed').map(m => m.schemeId), ...(mine.data.value?.applications ?? []).map(a => a.schemeId)]))
const joinable = computed(() => (offered.data.value?.schemes ?? []).filter(s => !held.value.has(s.id)))
const chosen = reactive<Record<string, string | undefined>>({})
const money = (fee: Fee) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: fee.currency }).format(fee.amountMinor / 100) // not-policy: minor units to units
/** The fee line under a paid scheme: one price, or the price of each length. */
function feeLine(s: Offered): string | undefined {
  if (!s.requiresPayment) return undefined
  if (s.fee) return t('membership.screens.mine.fee', { amount: money(s.fee) })
  const priced = s.options.filter(o => o.fee)
  if (!priced.length) return undefined
  return priced.length === 1 ? t('membership.screens.mine.fee', { amount: money(priced[0]!.fee!) }) : priced.map(o => `${o.name}: ${money(o.fee!)}`).join(' · ')
}
const references = reactive<Record<string, string>>({})

async function join(s: Offered) {
  try {
    const joined = await $api<{ pending: boolean, membershipId: string, waiting?: string }>(`/api/membership/schemes/${s.id}/join` as string, { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: { lengthOptionId: chosen[s.id] ?? (s.options.length === 1 ? s.options[0]!.id : null), reference: s.asksFor ? references[s.id]?.trim() : undefined } })
    if (joined.waiting === 'payment') return navigateTo(`/account/membership/${joined.membershipId}/pay`)
    if (joined.pending) {
      toast.add({ title: t('membership.screens.mine.applied', { scheme: s.name }), description: t('membership.screens.mine.waiting-staff'), color: 'success' })
      await mine.refresh()
      return
    }
    toast.add({ title: t('membership.screens.mine.joined', { scheme: s.name }), color: 'success' })
    // A members' scheme opens the members' area from this response on: reload so the header shows it.
    reloadNuxtApp()
  }
  catch (e) {
    const refusal = toRefusal(e)
    toast.add({ title: refusal.reason, description: refusal.remedy, color: 'error' })
  }
}
const { confirm } = useConfirm()
async function endMine(m: Mine['memberships'][number]) {
  if (!(await confirm({ verb: t('membership.screens.mine.verb-end'), thing: m.schemeName, consequence: t(m.side === 'members' ? 'membership.screens.mine.confirm-end-members' : 'membership.screens.mine.confirm-end'), button: t('membership.screens.mine.end') }))) return
  try {
    await $api(`/api/membership/mine/${m.id}/end` as string, { method: 'POST', body: {} })
    reloadNuxtApp()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}
// Renewing: the same scheme's lengths and, where it checks a reference again, the reference.
const renewing = ref<Mine['memberships'][number] | null>(null)
const renewChoice = reactive({ lengthOptionId: undefined as string | undefined, reference: '' })
const renewScheme = computed(() => (offered.data.value?.schemes ?? []).find(s => s.id === renewing.value?.schemeId))
const renewRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openRenew(m: Mine['memberships'][number]) {
  renewing.value = m
  Object.assign(renewChoice, { lengthOptionId: undefined, reference: '' })
  renewRefusal.value = null
}
async function renew() {
  renewRefusal.value = null
  try {
    const done = await $api<{ pending: boolean, membershipId: string, waiting?: string }>(`/api/membership/mine/${renewing.value!.id}/renew` as string, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: { lengthOptionId: renewChoice.lengthOptionId ?? null, reference: renewChoice.reference.trim() || undefined },
    })
    if (done.waiting === 'payment') return navigateTo(`/account/membership/${done.membershipId}/pay`)
    toast.add({ title: t(done.pending ? 'membership.screens.mine.renew-pending' : 'membership.screens.mine.renewed', { scheme: renewing.value!.schemeName }), color: 'success' })
    renewing.value = null
    await mine.refresh()
  }
  catch (e) {
    renewRefusal.value = toRefusal(e)
  }
}
// The card: shown full screen, with a code signed by the current key every time it is opened.
const showing = ref<Mine['memberships'][number] | null>(null)
async function withdraw(a: Mine['applications'][number]) {
  if (!(await confirm({ verb: t('membership.screens.mine.verb-withdraw'), thing: a.schemeName, consequence: t('membership.screens.mine.confirm-withdraw'), button: t('membership.screens.mine.withdraw') }))) return
  try {
    await $api(`/api/membership/mine/${a.id}/withdraw` as string, { method: 'POST', body: {} })
    await mine.refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
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
        <UAlert
          v-if="fromMembersArea"
          color="info"
          variant="subtle"
          icon="i-lucide-id-card"
          :title="lastEnded ? t('membership.members-area.ended', { scheme: lastEnded.schemeName, date: day(lastEnded.endsOn!) }) : t('membership.members-area.not-member')"
          :description="lastEnded ? t('membership.members-area.ended-help') : t('membership.members-area.not-member-help')"
        />
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
              :description="[m.endsOn ? t('membership.screens.mine.until', { date: day(m.endsOn) }) : t('membership.screens.mine.no-end'), m.renewed ? t('membership.screens.mine.already-renewed') : m.renewal && !m.renewal.open && m.status !== 'lapsed' ? t('membership.screens.mine.renewal-opens', { date: day(m.renewal.opensOn) }) : ''].filter(Boolean).join(' · ')"
              :muted="m.status === 'lapsed'"
            >
              <div class="flex flex-wrap items-center gap-2">
                <StatusBadge
                  :tone="TONE[m.status]"
                  :label="t(`membership.screens.derived.${m.status}`)"
                />
                <UButton
                  v-if="mine.data.value.card && m.status !== 'lapsed'"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-qr-code"
                  :label="t('membership.screens.mine.show-card')"
                  @click="showing = m"
                />
                <UButton
                  v-if="m.renewal?.open"
                  size="sm"
                  :label="t('membership.screens.mine.renew')"
                  @click="openRenew(m)"
                />
                <RowActions
                  :items="m.mayEnd && m.status !== 'lapsed' ? [[{ label: t('membership.screens.mine.end'), icon: 'i-lucide-log-out', color: 'error' as const, onSelect: () => endMine(m) }]] : []"
                  :label="t('membership.screens.mine.actions', { scheme: m.schemeName })"
                />
              </div>
            </RecordListItem>
          </RecordList>
        </PageSection>

        <PageSection
          v-if="mine.data.value?.applications.length"
          :title="t('membership.screens.mine.applications')"
        >
          <RecordList :label="t('membership.screens.mine.applications')">
            <RecordListItem
              v-for="a in mine.data.value.applications"
              :key="a.id"
              :name="a.schemeName"
              :description="a.waiting === 'payment' && a.charge ? t('membership.screens.mine.waiting-payment', { amount: money(a.charge) }) : t('membership.screens.mine.waiting-staff')"
            >
              <UButton
                v-if="a.waiting === 'payment' && a.charge"
                size="sm"
                :to="`/account/membership/${a.id}/pay`"
                :label="t('membership.screens.mine.pay', { amount: money(a.charge) })"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="sm"
                :label="t('membership.screens.mine.withdraw')"
                @click="withdraw(a)"
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
              :description="[s.summary, feeLine(s)].filter(Boolean).join(' · ') || undefined"
            >
              <span
                v-if="s.joinMode === 'staff-only'"
                class="text-sm text-muted"
              >{{ t('membership.screens.mine.staff-only') }}</span>
              <span
                v-else-if="!s.online"
                class="text-sm text-muted"
              >{{ t('membership.screens.mine.not-online') }}</span>
              <template v-else>
                <USelect
                  v-if="s.options.length > 1"
                  v-model="chosen[s.id]"
                  :items="s.options.map(o => ({ value: o.id, label: o.fee ? `${o.name}, ${money(o.fee)}` : o.name }))"
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
    <UModal
      :open="!!renewing"
      :title="renewing ? t('membership.screens.mine.renew-title', { scheme: renewing.schemeName }) : ''"
      @update:open="v => { if (!v) renewing = null }"
    >
      <template #body>
        <UForm
          id="membership-renew"
          :state="renewChoice"
          class="space-y-4"
          novalidate
          @submit="renew"
        >
          <RefusalNotice :refusal="renewRefusal" />
          <UFormField
            v-if="(renewScheme?.options.length ?? 0) > 1"
            :label="t('membership.screens.mine.choose-length')"
          >
            <USelect
              v-model="renewChoice.lengthOptionId"
              :items="renewScheme!.options.map(o => ({ value: o.id, label: o.name }))"
            />
          </UFormField>
          <UFormField
            v-if="renewScheme?.asksFor"
            :label="renewScheme.asksFor"
          >
            <UInput
              v-model="renewChoice.reference"
              autocomplete="off"
              maxlength="254"
            />
          </UFormField>
          <p class="text-sm text-muted">
            {{ t('membership.screens.mine.renew-help') }}
          </p>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-renew"
          loading-auto
          :label="t('membership.screens.mine.renew')"
        />
      </template>
    </UModal>
    <MembershipCardModal
      :membership="showing"
      :number="mine.data.value?.number?.label"
      @close="showing = null"
    />
  </PageFrame>
</template>
