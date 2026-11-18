<!-- My membership (MEM-10, MEM-11, MEM-33): what the person holds and until when, their member
     number, and the schemes they can join. A free scheme with nothing to check is joined here in one
     step, as is one that checks a list (a student ID, or a verified address); other schemes say how to
     join until applications are built. A scheme that requires payment shows its fee, and joining it
     goes on to the Pay page; an application waiting for its fee offers Pay from here. The card (MEM-33, MEM-51) opens full screen with a code that
     Box office signs each time it is opened; without Box office it shows no code. -->
<script setup lang="ts">
interface Fee { amountMinor: number, currency: string }
interface RenewAsks { options: { id: string, name: string, fee: Fee | null }[], fee: Fee | null, asksFor: string | null, endsByList: boolean, online: boolean }
interface Mine { card: boolean, applications: { id: string, schemeId: string, schemeName: string, appliedAt: number, waiting: 'staff' | 'payment', reason: string | null, charge: { state: string, amountMinor: number, currency: string } | null }[], number: { label: string, since: string } | null, memberships: { id: string, schemeId: string, schemeName: string, side: string, length: string | null, startsOn: string, endsOn: string | null, mayEnd: boolean, renewal: { opensOn: string, closesOn: string, open: boolean, asks?: RenewAsks | null } | null, renewed: boolean, status: 'upcoming' | 'current' | 'in-grace' | 'lapsed' }[] }
interface Offered { id: string, name: string, summary: string | null, joinMode: string, options: { id: string, name: string, fee: Fee | null }[], fee: Fee | null, requiresPayment: boolean, online: boolean, asksFor: string | null, endsByList: boolean }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()
const mine = await useAPI<Mine>('/api/membership/mine', { key: 'membership:mine' })
const offered = await useAPI<{ schemes: Offered[] }>('/api/membership/schemes', { key: 'membership:offered' })

const TONE = { 'upcoming': 'info', 'current': 'success', 'in-grace': 'warning', 'lapsed': 'neutral' } as const
const held = computed(() => new Set([...(mine.data.value?.memberships ?? []).filter(m => m.status !== 'lapsed').map(m => m.schemeId), ...(mine.data.value?.applications ?? []).map(a => a.schemeId)]))
const joinable = computed(() => (offered.data.value?.schemes ?? []).filter(s => !held.value.has(s.id)))
// Each scheme's join form: its length and reference, and the server's refusal, shown beside its field.
const joinForms = reactive<Record<string, { lengthOptionId: string | undefined, reference: string }>>({})
const formOf = (s: Offered) => (joinForms[s.id] ??= { lengthOptionId: undefined, reference: '' })
const joinRefusals = reactive<Record<string, ReturnType<typeof toRefusal> | null>>({})
const asksLength = (s: Offered) => !s.endsByList && s.options.length > 1
const hasFields = (s: Offered) => asksLength(s) || !!s.asksFor
/** A refusal about one field, shown under it; anything else shows above the form. */
const fieldRefusal = (refusal: ReturnType<typeof toRefusal> | null | undefined, field: string) => refusal?.fields?.[field] ? refusal : null
/** Whether a refusal shows under one of the join form's fields rather than above it. */
const onField = (s: Offered, refusal: ReturnType<typeof toRefusal> | null | undefined) => (!!s.asksFor && !!fieldRefusal(refusal, 'reference')) || (asksLength(s) && !!fieldRefusal(refusal, 'lengthOptionId'))
/** Why an application waits on the theatre, in the applicant's words. */
const waitingText = (reason: string | null | undefined) => t(reason === 'entry-already-used' || reason === 'name-differs' ? `membership.screens.mine.waiting-${reason}` : 'membership.screens.mine.waiting-staff')
// One card: a membership that follows on from one held now is not shown as a second card.
const cardFor = (m: Mine['memberships'][number]) => m.status === 'current' || m.status === 'in-grace' || (m.status === 'upcoming' && !(mine.data.value?.memberships ?? []).some(o => o.schemeId === m.schemeId && (o.status === 'current' || o.status === 'in-grace')))
/** A held membership's line: when it starts if it has not yet, until when, and its renewal. */
const heldLine = (m: Mine['memberships'][number]) => [
  m.status === 'upcoming' ? t('membership.screens.mine.from', { date: day(m.startsOn) }) : '',
  m.endsOn ? t('membership.screens.mine.until', { date: day(m.endsOn) }) : t('membership.screens.mine.no-end'),
  m.renewed ? t('membership.screens.mine.already-renewed') : m.renewal && !m.renewal.open && m.status !== 'lapsed' ? t('membership.screens.mine.renewal-opens', { date: day(m.renewal.opensOn) }) : '',
].filter(Boolean).join(' · ')
const money = (fee: Fee) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: fee.currency }).format(fee.amountMinor / 100) // not-policy: minor units to units
/** The fee line under a paid scheme: one price, or the price of each length. */
function feeLine(s: Offered): string | undefined {
  if (!s.requiresPayment) return undefined
  if (s.fee) return t('membership.screens.mine.fee', { amount: money(s.fee) })
  const priced = s.options.filter(o => o.fee)
  if (!priced.length) return undefined
  return priced.length === 1 ? t('membership.screens.mine.fee', { amount: money(priced[0]!.fee!) }) : priced.map(o => `${o.name}: ${money(o.fee!)}`).join(' · ')
}
async function join(s: Offered) {
  joinRefusals[s.id] = null
  const form = formOf(s)
  try {
    const joined = await $api<{ pending: boolean, membershipId: string, waiting?: string }>(`/api/membership/schemes/${s.id}/join` as string, { method: 'POST', headers: { 'idempotency-key': crypto.randomUUID() }, body: { lengthOptionId: s.endsByList ? null : form.lengthOptionId ?? (s.options.length === 1 ? s.options[0]!.id : null), reference: s.asksFor ? form.reference.trim() : undefined } })
    if (joined.waiting === 'payment') return navigateTo(`/account/membership/${joined.membershipId}/pay`)
    if (joined.pending) {
      toast.add({ title: t('membership.screens.mine.applied', { scheme: s.name }), description: waitingText(joined.waiting), color: 'success' })
      await mine.refresh()
      return
    }
    toast.add({ title: t('membership.screens.mine.joined', { scheme: s.name }), color: 'success' })
    // A members' scheme opens the members' area from this response on: reload so the header shows it.
    reloadNuxtApp()
  }
  catch (e) {
    joinRefusals[s.id] = toRefusal(e)
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
// Renewing: the scheme's own lengths and, where it checks a reference again, the reference. These
// come with the membership, so a closed scheme, which is not among the open ones, still renews.
const renewing = ref<Mine['memberships'][number] | null>(null)
const renewChoice = reactive({ lengthOptionId: undefined as string | undefined, reference: '' })
const renewScheme = computed(() => renewing.value?.renewal?.asks ?? null)
const optionLabel = (o: { name: string, fee: Fee | null }) => o.fee ? `${o.name}, ${money(o.fee)}` : o.name
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
      body: { lengthOptionId: renewScheme.value?.endsByList ? null : renewChoice.lengthOptionId ?? (renewScheme.value?.options.length === 1 ? renewScheme.value.options[0]!.id : null), reference: renewChoice.reference.trim() || undefined },
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
              :description="heldLine(m)"
              :muted="m.status === 'lapsed'"
            >
              <div class="flex flex-wrap items-center gap-2">
                <StatusBadge
                  :tone="TONE[m.status]"
                  :label="t(`membership.screens.derived.${m.status}`)"
                />
                <UButton
                  v-if="mine.data.value.card && cardFor(m)"
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
              :description="a.waiting === 'payment' && a.charge ? t('membership.screens.mine.waiting-payment', { amount: money(a.charge) }) : waitingText(a.reason)"
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
              <UButton
                v-else-if="!hasFields(s)"
                :label="t('membership.screens.mine.join')"
                loading-auto
                @click="join(s)"
              />
              <template
                v-if="s.joinMode !== 'staff-only' && s.online && (hasFields(s) || joinRefusals[s.id])"
                #below
              >
                <UForm
                  :state="formOf(s)"
                  :validate="() => needs({ ...(asksLength(s) ? { lengthOptionId: formOf(s).lengthOptionId } : {}), ...(s.asksFor ? { reference: formOf(s).reference } : {}) })"
                  class="space-y-3"
                  novalidate
                  @submit="join(s)"
                >
                  <RefusalNotice
                    v-if="joinRefusals[s.id] && !onField(s, joinRefusals[s.id])"
                    :refusal="joinRefusals[s.id]!"
                  />
                  <p
                    v-if="s.endsByList"
                    class="text-sm text-muted"
                  >
                    {{ t('membership.screens.mine.ends-by-list') }}
                  </p>
                  <UFormField
                    v-if="asksLength(s)"
                    name="lengthOptionId"
                    :label="t('membership.screens.mine.choose-length')"
                    :error="fieldRefusal(joinRefusals[s.id], 'lengthOptionId')?.reason"
                    required
                  >
                    <USelect
                      v-model="formOf(s).lengthOptionId"
                      :items="s.options.map(o => ({ value: o.id, label: optionLabel(o) }))"
                    />
                  </UFormField>
                  <UFormField
                    v-if="s.asksFor"
                    name="reference"
                    :label="s.asksFor"
                    :error="fieldRefusal(joinRefusals[s.id], 'reference')?.reason"
                    required
                  >
                    <UInput
                      v-model="formOf(s).reference"
                      autocomplete="off"
                      maxlength="254"
                    />
                    <template
                      v-if="fieldRefusal(joinRefusals[s.id], 'reference')"
                      #error
                    >
                      <MembershipRefusalText
                        :reason="joinRefusals[s.id]!.reason"
                        :remedy="joinRefusals[s.id]!.remedy"
                      />
                    </template>
                  </UFormField>
                  <UButton
                    v-if="hasFields(s)"
                    type="submit"
                    :label="t('membership.screens.mine.join')"
                    loading-auto
                  />
                </UForm>
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
          :validate="() => needs({ ...(!renewScheme?.endsByList && (renewScheme?.options.length ?? 0) > 1 ? { lengthOptionId: renewChoice.lengthOptionId } : {}), ...(renewScheme?.asksFor ? { reference: renewChoice.reference } : {}) })"
          class="space-y-4"
          novalidate
          @submit="renew"
        >
          <RefusalNotice
            v-if="renewRefusal && !(renewScheme?.asksFor && fieldRefusal(renewRefusal, 'reference')) && !(!renewScheme?.endsByList && (renewScheme?.options.length ?? 0) > 1 && fieldRefusal(renewRefusal, 'lengthOptionId'))"
            :refusal="renewRefusal"
          />
          <UFormField
            v-if="!renewScheme?.endsByList && (renewScheme?.options.length ?? 0) > 1"
            name="lengthOptionId"
            :label="t('membership.screens.mine.choose-length')"
            :error="fieldRefusal(renewRefusal, 'lengthOptionId')?.reason"
            required
          >
            <USelect
              v-model="renewChoice.lengthOptionId"
              :items="renewScheme!.options.map(o => ({ value: o.id, label: optionLabel(o) }))"
            />
          </UFormField>
          <p
            v-if="renewScheme?.fee"
            class="text-sm"
          >
            {{ t('membership.screens.mine.fee', { amount: money(renewScheme.fee) }) }}
          </p>
          <UFormField
            v-if="renewScheme?.asksFor"
            name="reference"
            :label="renewScheme.asksFor"
            :error="fieldRefusal(renewRefusal, 'reference')?.reason"
            required
          >
            <UInput
              v-model="renewChoice.reference"
              autocomplete="off"
              maxlength="254"
            />
            <template
              v-if="fieldRefusal(renewRefusal, 'reference')"
              #error
            >
              <MembershipRefusalText
                :reason="renewRefusal!.reason"
                :remedy="renewRefusal!.remedy"
              />
            </template>
          </UFormField>
          <p class="text-sm text-muted">
            {{ t(renewScheme?.endsByList ? 'membership.screens.mine.renew-help-list' : 'membership.screens.mine.renew-help') }}
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
