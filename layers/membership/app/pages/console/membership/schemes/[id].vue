<!-- One membership scheme (MEM-01, 02, 24, 56): what opening it still needs, its details, the
     lengths it can be held for with the dates a membership taken today would run to, and adding a
     member directly. -->
<script setup lang="ts">
interface Scheme {
  id: string
  key: string
  name: string
  summary: string | null
  side: 'members' | 'audience'
  state: 'draft' | 'open' | 'closed' | 'archived'
  joinMode: 'apply' | 'staff-only'
  lengthRule: 'fixed' | 'rolling' | 'indefinite'
  fixedEndMonth: number | null
  fixedEndDay: number | null
  rolloverDays: number
  renewalOpensDays: number
  graceDays: number
  voting: boolean
  holderMayEnd: boolean
  acceptsReference: boolean
  verifier: 'membership.staff' | 'membership.email-domain' | 'membership.list' | null
  verifierConfig: string | null
}
interface Option { id: string, name: string, count: number, state: 'offered' | 'withdrawn' }
interface Detail { scheme: Scheme, options: Option[], checklist: { code: string, done: boolean }[], sideLocked: boolean, example: { lengthOptionId: string | null, endsOn: string | null }[], lists: { id: string, name: string }[] }

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { day } = useDates()
const toast = useToast()
const { confirm } = useConfirm()
const { data, status, error, refresh } = await useAPI<Detail>(() => `/api/membership/schemes/${id.value}`, { key: `membership:scheme:${id.value}` })

const TONE = { draft: 'neutral', open: 'success', closed: 'warning', archived: 'neutral' } as const
const scheme = computed(() => data.value?.scheme)
const missing = computed(() => (data.value?.checklist ?? []).filter(i => !i.done))
const unit = computed(() => t(`membership.screens.units.${scheme.value?.lengthRule === 'fixed' ? 'years' : 'months'}`))

// Details: one form, saved as a whole.
const details = reactive({ name: '', key: '', summary: '', side: 'members' as Scheme['side'], joinMode: 'apply' as Scheme['joinMode'], lengthRule: 'rolling' as 'fixed' | 'rolling' | 'indefinite', fixedEndMonth: 7, fixedEndDay: 31, rolloverDays: 0, renewalOpensDays: 30, graceDays: 0, voting: false, holderMayEnd: true, acceptsReference: false, checks: 'none' as 'none' | NonNullable<Scheme['verifier']>, listId: undefined as string | undefined, domains: '' })
const detailsRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(scheme, (s) => {
  if (!s) return
  const config = s.verifierConfig ? JSON.parse(s.verifierConfig) as { listId?: string, domains?: string[] } : {}
  const { verifier: _verifier, verifierConfig: _config, ...fields } = s
  Object.assign(details, { ...fields, summary: s.summary ?? '', fixedEndMonth: s.fixedEndMonth ?? 7, fixedEndDay: s.fixedEndDay ?? 31, checks: s.verifier ?? 'none', listId: config.listId, domains: (config.domains ?? []).join(', ') })
}, { immediate: true })
async function saveDetails() {
  detailsRefusal.value = null
  const fixed = details.lengthRule === 'fixed'
  const { checks, listId, domains, ...fields } = details
  const verifier = checks === 'none' ? null : checks
  try {
    await $api(`/api/membership/schemes/${id.value}` as string, {
      method: 'PATCH',
      body: { ...fields, summary: details.summary.trim() || null, fixedEndMonth: fixed ? details.fixedEndMonth : null, fixedEndDay: fixed ? details.fixedEndDay : null, verifier, ...(verifier === 'membership.list' ? { listId: listId ?? null } : {}), ...(verifier === 'membership.email-domain' ? { domains: domains.split(/[\s,]+/).filter(Boolean) } : {}) },
    })
    toast.add({ title: t('membership.screens.scheme.saved'), color: 'success' })
    await refresh()
  }
  catch (e) {
    detailsRefusal.value = toRefusal(e)
  }
}

async function move(to: 'open' | 'closed' | 'archived') {
  if (to !== 'open' && !(await confirm({ verb: t(`membership.screens.scheme.verb-${to}`), thing: scheme.value!.name, consequence: t(`membership.screens.scheme.confirm-${to}`), button: t(`membership.screens.scheme.to-${to}`) }))) return
  try {
    const result = await $api<{ holders: number, pending: number }>(`/api/membership/schemes/${id.value}/state` as string, { method: 'POST', body: { to } })
    toast.add({ title: t(`membership.screens.scheme.moved-${to}`), description: to === 'open' ? undefined : t('membership.screens.scheme.affected', { count: result.holders }), color: 'success' })
    await refresh()
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, description: toRefusal(e).remedy, color: 'error' })
  }
}
async function remove() {
  if (!(await confirm({ verb: t('membership.screens.scheme.verb-delete'), thing: scheme.value!.name, consequence: t('membership.screens.scheme.confirm-delete'), button: t('membership.screens.scheme.delete') }))) return
  try {
    await $api(`/api/membership/schemes/${id.value}` as string, { method: 'DELETE', body: {} })
    await navigateTo('/console/membership/schemes')
  }
  catch (e) {
    toast.add({ title: toRefusal(e).reason, color: 'error' })
  }
}
const actions = computed(() => {
  const s = scheme.value
  if (!s) return []
  const out = []
  if (s.state === 'closed') out.push({ label: t('membership.screens.scheme.to-archived'), icon: 'i-lucide-archive', onSelect: () => move('archived') })
  if (s.state === 'archived') out.push({ label: t('membership.screens.scheme.to-closed'), icon: 'i-lucide-archive-restore', onSelect: () => move('closed') })
  if (s.state === 'draft') out.push({ label: t('membership.screens.scheme.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: remove })
  return out
})

// Lengths.
const option = reactive({ name: '', count: 12, idempotency: '' })
const optionRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function resetOption() {
  Object.assign(option, { name: '', count: scheme.value?.lengthRule === 'fixed' ? 1 : 12, idempotency: crypto.randomUUID() })
}
watch(scheme, resetOption, { immediate: true })
async function addOption() {
  optionRefusal.value = null
  try {
    await $api(`/api/membership/schemes/${id.value}/options` as string, { method: 'POST', headers: { 'idempotency-key': option.idempotency }, body: { name: option.name, count: option.count } })
    resetOption()
    await refresh()
  }
  catch (e) {
    optionRefusal.value = toRefusal(e)
  }
}
async function toggleOption(o: Option) {
  await $api(`/api/membership/schemes/${id.value}/options/${o.id}` as string, { method: 'PATCH', body: { state: o.state === 'offered' ? 'withdrawn' : 'offered' } })
  await refresh()
}
const exampleFor = (optionId: string) => data.value?.example.find(e => e.lengthOptionId === optionId)?.endsOn

// Adding a member directly.
const adding = ref(false)
const member = reactive({ name: '', address: '', lengthOptionId: undefined as string | undefined, startsOn: '', endsOn: '', note: '', idempotency: '' })
const memberRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openAdd() {
  Object.assign(member, { name: '', address: '', lengthOptionId: data.value?.options.find(o => o.state === 'offered')?.id, startsOn: '', endsOn: '', note: '', idempotency: crypto.randomUUID() })
  memberRefusal.value = null
  adding.value = true
}
async function addMember() {
  memberRefusal.value = null
  try {
    const added = await $api<{ endsOn: string | null, opensMembersArea: boolean }>(`/api/membership/schemes/${id.value}/members` as string, {
      method: 'POST',
      headers: { 'idempotency-key': member.idempotency },
      body: { name: member.name.trim() || undefined, address: member.address.trim(), lengthOptionId: member.lengthOptionId ?? null, startsOn: member.startsOn || undefined, endsOn: member.endsOn || undefined, note: member.note.trim() || undefined },
    })
    adding.value = false
    toast.add({
      title: t('membership.screens.add-member.added'),
      description: t(added.opensMembersArea ? 'membership.screens.add-member.opens-area' : 'membership.screens.add-member.no-area'),
      color: 'success',
    })
    await refresh()
  }
  catch (e) {
    memberRefusal.value = toRefusal(e)
  }
}
</script>

<template>
  <PageFrame :title="scheme?.name ?? t('membership.navigation.schemes.label')">
    <template
      v-if="scheme"
      #status
    >
      <StatusBadge
        :tone="TONE[scheme.state]"
        :label="t(`membership.screens.states.${scheme.state}`)"
      />
    </template>
    <template
      v-if="scheme"
      #primary
    >
      <div class="flex gap-2">
        <UButton
          v-if="scheme.state === 'open'"
          :label="t('membership.screens.add-member.title')"
          icon="i-lucide-user-plus"
          @click="openAdd"
        />
        <UButton
          v-if="scheme.state === 'draft' || scheme.state === 'closed'"
          :label="t('membership.screens.scheme.to-open')"
          :disabled="missing.length > 0"
          :color="scheme.state === 'draft' ? 'primary' : 'neutral'"
          :variant="scheme.state === 'draft' ? 'solid' : 'outline'"
          loading-auto
          @click="move('open')"
        />
        <UButton
          v-if="scheme.state === 'open'"
          :label="t('membership.screens.scheme.to-closed')"
          color="neutral"
          variant="outline"
          @click="move('closed')"
        />
        <RowActions
          :items="actions"
          :label="t('membership.screens.scheme.actions', { scheme: scheme.name })"
        />
      </div>
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <div
        v-if="data && scheme"
        class="space-y-6"
      >
        <UAlert
          v-if="scheme.state === 'draft' && missing.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-list-checks"
          :title="t('membership.screens.scheme.not-ready')"
        >
          <template #description>
            <ul class="list-disc ps-5">
              <li
                v-for="item in missing"
                :key="item.code"
              >
                {{ t(`membership.screens.checklist.${item.code}`) }}
              </li>
            </ul>
          </template>
        </UAlert>

        <PageSection
          v-if="scheme.lengthRule !== 'indefinite'"
          :title="t('membership.screens.lengths.title')"
          :description="t('membership.screens.lengths.help', { unit })"
        >
          <RecordList
            v-if="data.options.length"
            :label="t('membership.screens.lengths.title')"
          >
            <RecordListItem
              v-for="o in data.options"
              :key="o.id"
              :name="o.name"
              :description="o.state === 'offered' && exampleFor(o.id) ? t('membership.screens.lengths.example', { date: day(exampleFor(o.id)!) }) : t('membership.screens.lengths.withdrawn')"
              :muted="o.state === 'withdrawn'"
            >
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                :label="t(o.state === 'offered' ? 'membership.screens.lengths.withdraw' : 'membership.screens.lengths.offer')"
                loading-auto
                @click="toggleOption(o)"
              />
            </RecordListItem>
          </RecordList>
          <template #footer>
            <UForm
              :state="option"
              class="flex flex-wrap items-end gap-3"
              @submit="addOption"
            >
              <UFormField
                :label="t('membership.screens.lengths.name')"
                :error="optionRefusal?.reason"
              >
                <UInput
                  v-model="option.name"
                  maxlength="40"
                  :placeholder="t('membership.screens.lengths.name-placeholder')"
                />
              </UFormField>
              <UFormField :label="unit">
                <UInputNumber
                  v-model="option.count"
                  :min="1"
                  :max="120"
                />
              </UFormField>
              <UButton
                type="submit"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                loading-auto
                :disabled="!option.name.trim()"
                :label="t('membership.screens.lengths.add')"
              />
            </UForm>
          </template>
        </PageSection>
        <PageSection
          v-else
          :title="t('membership.screens.lengths.title')"
          :description="t('membership.screens.lengths.indefinite')"
        />

        <PageSection
          :title="t('membership.screens.scheme.details')"
        >
          <UForm
            id="membership-scheme-details"
            :state="details"
            class="space-y-4"
            @submit="saveDetails"
          >
            <RefusalNotice :refusal="detailsRefusal" />
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                :label="t('membership.screens.scheme.name')"
                required
              >
                <UInput
                  v-model="details.name"
                  maxlength="80"
                />
              </UFormField>
              <UFormField
                :label="t('membership.screens.scheme.key')"
                :help="scheme.state === 'draft' ? t('membership.screens.scheme.key-help') : t('membership.screens.scheme.key-fixed')"
                required
              >
                <UInput
                  v-model="details.key"
                  maxlength="60"
                  class="font-mono"
                  :disabled="scheme.state !== 'draft'"
                />
              </UFormField>
            </div>
            <UFormField
              :label="t('membership.screens.scheme.summary')"
              :help="t('membership.screens.scheme.summary-help')"
            >
              <UTextarea
                v-model="details.summary"
                maxlength="500"
                :rows="2"
              />
            </UFormField>
            <UFormField
              :label="t('membership.screens.scheme.side')"
              :help="data.sideLocked ? t('membership.screens.scheme.side-locked') : t('membership.screens.scheme.side-help')"
            >
              <URadioGroup
                v-model="details.side"
                :disabled="data.sideLocked"
                :items="(['members', 'audience'] as const).map(v => ({ value: v, label: t(`membership.screens.sides.${v}`), description: t(`membership.screens.sides.${v}-help`) }))"
              />
            </UFormField>
            <UFormField :label="t('membership.screens.scheme.join-mode')">
              <URadioGroup
                v-model="details.joinMode"
                :items="(['apply', 'staff-only'] as const).map(v => ({ value: v, label: t(`membership.screens.join-modes.${v}`), description: t(`membership.screens.join-modes.${v}-help`) }))"
              />
            </UFormField>
            <MembershipLengthRule
              v-model:rule="details.lengthRule"
              v-model:month="details.fixedEndMonth"
              v-model:day="details.fixedEndDay"
            />
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField
                v-if="details.lengthRule === 'fixed'"
                :label="t('membership.screens.scheme.rollover')"
                :help="t('membership.screens.scheme.rollover-help')"
              >
                <UInputNumber
                  v-model="details.rolloverDays"
                  :min="0"
                  :max="180"
                />
              </UFormField>
              <UFormField
                :label="t('membership.screens.scheme.renewal-opens')"
                :help="t('membership.screens.scheme.renewal-opens-help')"
              >
                <UInputNumber
                  v-model="details.renewalOpensDays"
                  :min="0"
                  :max="180"
                />
              </UFormField>
              <UFormField
                :label="t('membership.screens.scheme.grace')"
                :help="t('membership.screens.scheme.grace-help')"
              >
                <UInputNumber
                  v-model="details.graceDays"
                  :min="0"
                  :max="90"
                />
              </UFormField>
            </div>
            <USwitch
              v-model="details.acceptsReference"
              :label="t('membership.screens.scheme.accepts-reference')"
              :description="t('membership.screens.scheme.accepts-reference-help')"
            />
            <UFormField
              :label="t('membership.screens.scheme.checks')"
              :help="t('membership.screens.scheme.checks-help')"
            >
              <URadioGroup
                v-model="details.checks"
                :items="(['none', 'membership.staff', 'membership.email-domain', 'membership.list'] as const).map(v => ({ value: v, label: t(`membership.screens.verifiers.${v}`), description: t(`membership.screens.verifiers.${v}-help`) }))"
              />
            </UFormField>
            <UFormField
              v-if="details.checks === 'membership.email-domain'"
              :label="t('membership.screens.scheme.domains')"
              :help="t('membership.screens.scheme.domains-help')"
            >
              <UInput
                v-model="details.domains"
                placeholder="nottingham.ac.uk"
              />
            </UFormField>
            <UFormField
              v-if="details.checks === 'membership.list'"
              :label="t('membership.screens.scheme.list')"
              :error="detailsRefusal?.fields?.listId ? detailsRefusal.reason : undefined"
            >
              <USelect
                v-model="details.listId"
                :items="data.lists.map(l => ({ value: l.id, label: l.name }))"
                :placeholder="t('membership.screens.scheme.list-choose')"
                class="sm:w-80"
              />
              <template #help>
                <ULink
                  to="/console/membership/lists"
                  class="underline"
                >
                  {{ t('membership.screens.scheme.list-manage') }}
                </ULink>
              </template>
            </UFormField>
            <USwitch
              v-model="details.holderMayEnd"
              :label="t('membership.screens.scheme.holder-may-end')"
              :description="t('membership.screens.scheme.holder-may-end-help')"
            />
          </UForm>
          <template #footer>
            <UButton
              type="submit"
              form="membership-scheme-details"
              loading-auto
              :label="t('membership.screens.scheme.save')"
            />
          </template>
        </PageSection>
      </div>
    </DataBoundary>

    <UModal
      v-model:open="adding"
      :title="t('membership.screens.add-member.title')"
      :description="t('membership.screens.add-member.help')"
    >
      <template #body>
        <UForm
          id="membership-add-member"
          :state="member"
          class="space-y-4"
          @submit="addMember"
        >
          <RefusalNotice :refusal="memberRefusal" />
          <UFormField
            :label="t('membership.screens.add-member.address')"
            required
          >
            <UInput
              v-model="member.address"
              type="email"
              autocomplete="off"
            />
          </UFormField>
          <UFormField
            :label="t('membership.screens.add-member.name')"
            :help="t('membership.screens.add-member.name-help')"
          >
            <UInput
              v-model="member.name"
              maxlength="120"
              autocomplete="off"
            />
          </UFormField>
          <UFormField
            v-if="data && data.options.length > 1"
            :label="t('membership.screens.lengths.title')"
          >
            <USelect
              v-model="member.lengthOptionId"
              :items="data.options.map(o => ({ value: o.id, label: o.name }))"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('membership.screens.add-member.starts')"
              :help="t('membership.screens.add-member.starts-help')"
            >
              <FieldDate v-model="member.startsOn" />
            </UFormField>
            <UFormField
              :label="t('membership.screens.add-member.ends')"
              :help="t('membership.screens.add-member.ends-help')"
            >
              <FieldDate
                v-model="member.endsOn"
                :min="member.startsOn || undefined"
              />
            </UFormField>
          </div>
          <UFormField
            :label="t('membership.screens.add-member.note')"
            :help="t('membership.screens.add-member.note-help')"
          >
            <UTextarea
              v-model="member.note"
              maxlength="1000"
              :rows="2"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-add-member"
          loading-auto
          :disabled="!member.address.trim()"
          :label="t('membership.screens.add-member.submit')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
