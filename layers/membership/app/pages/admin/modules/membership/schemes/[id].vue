<!-- One membership scheme (MEM-01, 02, 24, 56): what opening it still needs, its details, the
     lengths it can be held for with the dates a membership taken today would run to, and adding a
     member directly. -->
<script setup lang="ts">
import { z } from 'zod'
import { convertCount, endsOnFor } from '../../../../../../shared/dates'

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
  requiresPayment: boolean
}
interface Option { id: string, name: string, count: number, state: 'offered' | 'withdrawn' }
interface Detail { scheme: Scheme, options: Option[], checklist: { code: string, done: boolean }[], sideLocked: boolean, example: { lengthOptionId: string | null, endsOn: string | null }[], lists: { id: string, name: string }[], feesOn: boolean, feesModuleOn: boolean, canImport: boolean }

const route = useRoute()
const id = computed(() => String(route.params.id))
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { day, toLocal } = useDates()
const toast = useToast()
const { confirm } = useConfirm()
const { offer } = useUndo()
const { data, status, error, refresh } = await useAPI<Detail>(() => `/api/membership/schemes/${id.value}`, { key: `membership:scheme:${id.value}` })

const TONE = { draft: 'neutral', open: 'success', closed: 'warning', archived: 'neutral' } as const
const scheme = computed(() => data.value?.scheme)
const missing = computed(() => (data.value?.checklist ?? []).filter(i => !i.done))
const unit = computed(() => t(`membership.screens.units.${scheme.value?.lengthRule === 'fixed' ? 'years' : 'months'}`))

// Details: one form, saved as a whole.
const details = reactive({ name: '', key: '', summary: '', side: 'members' as Scheme['side'], joinMode: 'apply' as Scheme['joinMode'], lengthRule: 'rolling' as 'fixed' | 'rolling' | 'indefinite', fixedEndMonth: 7, fixedEndDay: 31, rolloverDays: 0, renewalOpensDays: 30, graceDays: 0, voting: false, holderMayEnd: true, requiresPayment: false, acceptsReference: false, checks: 'none' as 'none' | NonNullable<Scheme['verifier']>, listId: undefined as string | undefined, domains: '' })
// The windows are stored as days and edited as a number and a unit, like the module's settings.
const SECONDS_IN_DAY = 86400 // not-policy: seconds in a day
const asDuration = (field: 'rolloverDays' | 'renewalOpensDays' | 'graceDays') => computed<number | null>({
  get: () => details[field] * SECONDS_IN_DAY,
  set: (seconds) => { details[field] = Math.round((seconds ?? 0) / SECONDS_IN_DAY) },
})
const rolloverWindow = asDuration('rolloverDays')
const renewalWindow = asDuration('renewalOpensDays')
const graceWindow = asDuration('graceDays')
const detailsRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
watch(scheme, (s) => {
  if (!s) return
  const config = s.verifierConfig ? JSON.parse(s.verifierConfig) as { listId?: string, domains?: string[] } : {}
  const { verifier: _verifier, verifierConfig: _config, ...fields } = s
  Object.assign(details, { ...fields, summary: s.summary ?? '', fixedEndMonth: s.fixedEndMonth ?? 7, fixedEndDay: s.fixedEndDay ?? 31, checks: s.verifier ?? 'none', listId: config.listId, domains: (config.domains ?? []).join(', ') })
}, { immediate: true })
// Lengths are a bare count in the rule's unit, so changing the rule restates them; the officer sees the new dates first.
async function confirmLengthRule(): Promise<boolean> {
  const s = scheme.value!
  const options = data.value?.options ?? []
  if (details.lengthRule === s.lengthRule || !options.length) return true
  const rule = { lengthRule: details.lengthRule, fixedEndMonth: details.fixedEndMonth, fixedEndDay: details.fixedEndDay, rolloverDays: details.rolloverDays }
  const unitName = t(`membership.screens.units.${details.lengthRule === 'fixed' ? 'years' : 'months'}`).toLocaleLowerCase()
  const today = toLocal(Date.now()).slice(0, 10) // not-policy: the date part of a local date and time
  const lines = options.filter(o => o.state === 'offered').map((o) => {
    const count = convertCount(s.lengthRule, details.lengthRule, o.count)
    const ends = count === null ? null : endsOnFor(rule, today, count)
    return count === null || !ends ? o.name : t('membership.screens.scheme.confirm-length-line', { name: o.name, count, unit: unitName, ends: day(ends) })
  })
  return await confirm({
    verb: t('membership.screens.scheme.verb-length-rule'),
    thing: t('membership.screens.scheme.thing-length-rule', { scheme: s.name }),
    consequence: t('membership.screens.scheme.confirm-length-rule', { unit: unitName, lines: lines.join('; ') }),
    button: t('membership.screens.scheme.change-length-rule'),
  })
}
async function saveDetails() {
  detailsRefusal.value = null
  if (!(await confirmLengthRule())) return
  const fixed = details.lengthRule === 'fixed'
  const { checks, listId, domains, requiresPayment, ...rest } = details
  // While Membership fees is off the switch is locked, so the stored value is left as it is.
  const fields = data.value?.feesModuleOn ? { ...rest, requiresPayment } : rest
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
    await navigateTo('/admin/modules/membership/schemes')
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
  if (data.value?.canImport && (s.state === 'open' || s.state === 'closed')) out.push({ label: t('membership.screens.import.action'), icon: 'i-lucide-file-up', onSelect: openImport })
  if (s.state === 'draft') out.push({ label: t('membership.screens.scheme.delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: remove })
  return out
})

// Importing members from a file (MEM-49): tried first, then queued once the officer has seen the outcome.
interface Imported { queued: number, wouldImport?: number, refused: { line: number, reason: string }[] }
const importing = ref(false)
const importFile = ref<File | null>(null)
const importPreview = ref<Imported | null>(null)
const importRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
function openImport() {
  importFile.value = null
  importPreview.value = null
  importRefusal.value = null
  importing.value = true
}
async function sendImport(dryRun: boolean): Promise<Imported | null> {
  importRefusal.value = null
  try {
    return await $api<Imported>(`/api/membership/schemes/${id.value}/import` as string, { method: 'POST', body: { file: await importFile.value!.text(), dryRun } })
  }
  catch (e) {
    importRefusal.value = toRefusal(e)
    return null
  }
}
watch(importFile, async (f) => {
  importPreview.value = f ? await sendImport(true) : null
})
async function runImport() {
  const done = await sendImport(false)
  if (!done) return
  toast.add({ title: t('membership.screens.import.queued', { count: done.queued }), description: t('membership.screens.import.queued-help'), color: 'success' })
  importing.value = false
}

// Lengths: added from a window, withdrawn or offered again from the row's menu with an Undo.
const option = reactive({ name: '', count: 12, idempotency: '' })
const optionRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const addingOption = ref(false)
const optionSchema = z.object({ name: z.string().trim().min(1).max(40), count: z.number().int().min(1).max(120) }) // not-policy: the route's bounds
function resetOption() {
  Object.assign(option, { name: '', count: scheme.value?.lengthRule === 'fixed' ? 1 : 12, idempotency: crypto.randomUUID() })
}
watch(scheme, resetOption, { immediate: true })
function openOption() {
  resetOption()
  optionRefusal.value = null
  addingOption.value = true
}
async function addOption() {
  optionRefusal.value = null
  try {
    await $api(`/api/membership/schemes/${id.value}/options` as string, { method: 'POST', headers: { 'idempotency-key': option.idempotency }, body: { name: option.name, count: option.count } })
    toast.add({ title: t('membership.screens.lengths.added', { name: option.name.trim() }), color: 'success' })
    addingOption.value = false
    await refresh()
  }
  catch (e) {
    optionRefusal.value = toRefusal(e)
  }
}
const setOption = (o: Option, state: Option['state']) => $api(`/api/membership/schemes/${id.value}/options/${o.id}` as string, { method: 'PATCH', body: { state } })
async function toggleOption(o: Option) {
  const to = o.state === 'offered' ? 'withdrawn' : 'offered'
  await setOption(o, to)
  await refresh()
  offer(t(`membership.screens.lengths.${to}-done`, { name: o.name }), async () => {
    await setOption(o, o.state)
    await refresh()
  })
}
const optionActions = (o: Option) => [[o.state === 'offered'
  ? { label: t('membership.screens.lengths.withdraw'), icon: 'i-lucide-archive', onSelect: () => toggleOption(o) }
  : { label: t('membership.screens.lengths.offer'), icon: 'i-lucide-archive-restore', onSelect: () => toggleOption(o) }]]
const offeredOptions = computed(() => (data.value?.options ?? []).filter(o => o.state === 'offered'))
const withdrawnOptions = computed(() => (data.value?.options ?? []).filter(o => o.state === 'withdrawn'))
const showWithdrawn = ref(false)
const exampleFor = (optionId: string) => data.value?.example.find(e => e.lengthOptionId === optionId)?.endsOn

// Adding a member directly.
const adding = ref(false)
const member = reactive({ name: '', address: '', lengthOptionId: undefined as string | undefined, startsOn: '', endsOn: '', note: '', fee: 'link' as 'link' | 'waive', idempotency: '' })
// P9: for a scheme whose fee is collected through the system, a link to pay or a waiver.
const asksFee = computed(() => !!data.value?.feesOn)
const byLink = computed(() => asksFee.value && member.fee === 'link')
const memberRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const memberForm = useTemplateRef('memberForm')
// What the add route checks, beside each field; a waived fee needs its reason.
const memberSchema = z.object({
  address: z.string().trim().email().max(254), // not-policy: the longest address there is
  name: z.string().trim().max(120), // not-policy: shape bound
  note: z.string().trim().max(1000), // not-policy: shape bound
}).passthrough().superRefine((value, ctx) => {
  if (asksFee.value && member.fee === 'waive' && !value.note) ctx.addIssue({ code: 'custom', path: ['note'], message: t('core.form.invalid.required') })
})
function openAdd() {
  Object.assign(member, { name: '', address: '', lengthOptionId: data.value?.options.find(o => o.state === 'offered')?.id, startsOn: '', endsOn: '', note: '', fee: 'link', idempotency: crypto.randomUUID() })
  memberRefusal.value = null
  adding.value = true
}
async function addMember() {
  memberRefusal.value = null
  try {
    const added = await $api<{ endsOn: string | null, opensMembersArea: boolean, waiting?: string }>(`/api/membership/schemes/${id.value}/members` as string, {
      method: 'POST',
      headers: { 'idempotency-key': member.idempotency },
      body: {
        name: member.name.trim() || undefined, address: member.address.trim(), lengthOptionId: member.lengthOptionId ?? null, note: member.note.trim() || undefined,
        ...(byLink.value ? {} : { startsOn: member.startsOn || undefined, endsOn: member.endsOn || undefined }),
        ...(asksFee.value ? { fee: member.fee } : {}),
      },
    })
    adding.value = false
    if (added.waiting === 'payment') {
      toast.add({ title: t('membership.screens.add-member.link-sent'), color: 'success' })
      return
    }
    toast.add({
      title: t('membership.screens.add-member.added'),
      description: t(added.opensMembersArea ? 'membership.screens.add-member.opens-area' : 'membership.screens.add-member.no-area'),
      color: 'success',
    })
    await refresh()
  }
  catch (e) {
    memberRefusal.value = toRefusal(e)
    memberForm.value?.setErrors(fieldErrors(memberRefusal.value))
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
          :description="t('membership.screens.lengths.help', { unit: unit.toLocaleLowerCase() })"
        >
          <template
            v-if="data.options.length"
            #actions
          >
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              :label="t('membership.screens.lengths.add')"
              @click="openOption"
            />
          </template>
          <EmptyState
            v-if="!data.options.length"
            :title="t('membership.screens.lengths.empty')"
            :description="t('membership.screens.lengths.empty-help')"
            icon="i-lucide-calendar-range"
          >
            <template #actions>
              <UButton
                icon="i-lucide-plus"
                :label="t('membership.screens.lengths.add')"
                @click="openOption"
              />
            </template>
          </EmptyState>
          <template v-else>
            <RecordList
              v-if="offeredOptions.length"
              :label="t('membership.screens.lengths.title')"
            >
              <RecordListItem
                v-for="o in offeredOptions"
                :key="o.id"
                :name="o.name"
                :description="exampleFor(o.id) ? t('membership.screens.lengths.example', { date: day(exampleFor(o.id)!) }) : undefined"
              >
                <RowActions
                  :items="optionActions(o)"
                  :label="t('membership.screens.lengths.actions', { name: o.name })"
                />
              </RecordListItem>
            </RecordList>
            <CollapsibleDivider
              v-model:open="showWithdrawn"
              :label="t('membership.screens.lengths.withdrawn-heading')"
              :count="withdrawnOptions.length"
            >
              <RecordList :label="t('membership.screens.lengths.withdrawn-heading')">
                <RecordListItem
                  v-for="o in withdrawnOptions"
                  :key="o.id"
                  :name="o.name"
                  :description="t('membership.screens.lengths.withdrawn')"
                  muted
                >
                  <RowActions
                    :items="optionActions(o)"
                    :label="t('membership.screens.lengths.actions', { name: o.name })"
                  />
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
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
            novalidate
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
            <div
              v-if="details.lengthRule === 'fixed'"
              class="grid gap-4 sm:grid-cols-2"
            >
              <UFormField
                :label="t('membership.screens.scheme.rollover')"
                :help="t('membership.screens.scheme.rollover-help')"
              >
                <DurationInput
                  v-model="rolloverWindow"
                  block
                  :label="t('membership.screens.scheme.rollover')"
                  min="0d"
                  max="180d"
                />
              </UFormField>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                :label="t('membership.screens.scheme.renewal-opens')"
                :help="t('membership.screens.scheme.renewal-opens-help')"
              >
                <DurationInput
                  v-model="renewalWindow"
                  block
                  :label="t('membership.screens.scheme.renewal-opens')"
                  min="0d"
                  max="180d"
                />
              </UFormField>
              <UFormField
                :label="t('membership.screens.scheme.grace')"
                :help="t('membership.screens.scheme.grace-help')"
              >
                <DurationInput
                  v-model="graceWindow"
                  block
                  :label="t('membership.screens.scheme.grace')"
                  min="0d"
                  max="90d"
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
                  to="/admin/modules/membership/lists"
                  class="underline"
                >
                  {{ t('membership.screens.scheme.list-manage') }}
                </ULink>
              </template>
            </UFormField>
            <USwitch
              :model-value="data.feesModuleOn && details.requiresPayment"
              :disabled="!data.feesModuleOn"
              :label="t('membership.screens.scheme.requires-payment')"
              :description="t(data.feesModuleOn ? 'membership.screens.scheme.requires-payment-help' : 'membership.screens.scheme.requires-payment-off')"
              @update:model-value="details.requiresPayment = $event"
            />
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
      v-model:open="addingOption"
      :title="t('membership.screens.lengths.add')"
    >
      <template #body>
        <UForm
          id="membership-length-form"
          :state="option"
          :schema="optionSchema"
          class="grid gap-4 sm:grid-cols-2"
          novalidate
          @submit="addOption"
        >
          <RefusalNotice
            :refusal="optionRefusal"
            class="sm:col-span-2"
          />
          <UFormField
            name="name"
            :label="t('membership.screens.lengths.name')"
            required
          >
            <UInput
              v-model="option.name"
              maxlength="40"
              :placeholder="t('membership.screens.lengths.name-placeholder')"
            />
          </UFormField>
          <UFormField
            name="count"
            :label="unit"
            required
          >
            <UInputNumber
              v-model="option.count"
              :min="1"
              :max="120"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="membership-length-form"
          loading-auto
          :label="t('membership.screens.lengths.add')"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="adding"
      :title="t('membership.screens.add-member.title')"
      :description="t('membership.screens.add-member.help')"
    >
      <template #body>
        <UForm
          id="membership-add-member"
          ref="memberForm"
          :schema="memberSchema"
          :state="member"
          class="space-y-4"
          novalidate
          @submit="addMember"
        >
          <RefusalNotice :refusal="memberRefusal" />
          <UFormField
            name="address"
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
            name="name"
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
            name="lengthOptionId"
            :label="t('membership.screens.lengths.title')"
          >
            <USelect
              v-model="member.lengthOptionId"
              :items="data.options.map(o => ({ value: o.id, label: o.name }))"
            />
          </UFormField>
          <UFormField
            v-if="asksFee"
            name="fee"
            :label="t('membership.screens.add-member.fee')"
          >
            <URadioGroup
              v-model="member.fee"
              :items="(['link', 'waive'] as const).map(v => ({ value: v, label: t(`membership.screens.add-member.fee-${v}`), description: t(`membership.screens.add-member.fee-${v}-help`) }))"
            />
          </UFormField>
          <div
            v-if="!byLink"
            class="grid gap-4 sm:grid-cols-2"
          >
            <UFormField
              name="startsOn"
              :label="t('membership.screens.add-member.starts')"
              :help="t('membership.screens.add-member.starts-help')"
            >
              <FieldDate v-model="member.startsOn" />
            </UFormField>
            <UFormField
              name="endsOn"
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
            name="note"
            :label="t('membership.screens.add-member.note')"
            :help="asksFee && member.fee === 'waive' ? t('membership.screens.add-member.waive-note-help') : t('membership.screens.add-member.note-help')"
            :required="asksFee && member.fee === 'waive'"
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
          :label="t('membership.screens.add-member.submit')"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="importing"
      :title="t('membership.screens.import.title')"
      :description="t('membership.screens.import.help')"
    >
      <template #body>
        <div class="space-y-4">
          <RefusalNotice :refusal="importRefusal" />
          <UFileUpload
            v-model="importFile"
            accept=".csv,text/csv,text/plain"
            :label="t('membership.screens.import.file')"
            :description="t('membership.screens.import.file-help')"
            class="w-full"
          />
          <UAlert
            v-if="importPreview"
            :color="importPreview.refused.length ? 'warning' : 'success'"
            variant="subtle"
            :title="t('membership.screens.import.would-import', { count: importPreview.wouldImport ?? 0 })"
          >
            <template
              v-if="importPreview.refused.length"
              #description
            >
              <p>{{ t('membership.screens.import.refused', { count: importPreview.refused.length }) }}</p>
              <ul class="list-disc ps-5">
                <li
                  v-for="r in importPreview.refused.slice(0, 10)"
                  :key="r.line"
                >
                  {{ t('membership.screens.list.refused-line', { line: r.line, reason: t(`membership.screens.import.reasons.${r.reason}`) }) }}
                </li>
              </ul>
            </template>
          </UAlert>
        </div>
      </template>
      <template #footer>
        <UButton
          icon="i-lucide-file-up"
          loading-auto
          :disabled="!importPreview?.wouldImport"
          :label="t('membership.screens.import.submit')"
          @click="runImport"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
