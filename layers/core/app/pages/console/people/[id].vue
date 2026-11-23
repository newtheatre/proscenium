<!-- One person in the console (Identity Doc part 5, "Account"): who they are and their addresses
     beside the sections, how they sign in, their roles, standings and sessions. Every action the
     viewer may take is offered and asks for confirmation, or offers Undo; the server says which those
     are. Details and addresses are edited here, on the person's own page (ID-46). Opening
     the page is audited. Emergency contacts and access needs stay closed until asked for, and each
     read is recorded; a section the viewer may not open is absent, not empty. -->
<script setup lang="ts">
import { z } from 'zod'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { RefusalView } from '../../../utils/refusal'
import type { GrantOptions } from '../../../components/GiveRoleDialog.vue'

definePageMeta({ layout: 'console' })

interface Person {
  id: string
  name: string | null
  pronouns: string | null
  origin: string
  createdAt: number
  claimed: boolean
  lastSignedInAt: number | null
  disabled: { at: number, reason: string | null } | null
  anonymised: boolean
  mergedInto: string | null
  addresses: Address[]
  passkeys: { id: string, label: string, addedAt: number, lastUsedAt: number | null }[]
  providers: string[]
  liveSessions: number
  standings: { source: string, label?: string }[]
  accessScheme?: { status: 'submitted' | 'more-info' | 'accepted' | 'rejected', submittedAt: number } | null
  actions: { update: boolean, recover: boolean, disable: boolean, merge: boolean, endSessions: boolean, grants: boolean, erase: boolean, emergencyContacts: boolean, accessNeeds: boolean, accessScheme: boolean }
}
interface Address { id: string, address: string, verified: boolean, audience: boolean, members: boolean }
interface Contact { name: string, relationship: string | null, phone: string }
interface Needs { shared: boolean, needs?: { key: string, label: string, note?: string }[], companions?: number }
interface Grant { id: string, role: string, state: string, scope: { kind: string, module: string | null }, expiresAt: number | null, endedAt: number | null }

const { t, te } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const { offer } = useUndo()
const { day, dateTime } = useDates()
const route = useRoute()
const id = computed(() => String(route.params.id))

const { data, status, error, refresh } = await useAPI<Person>(() => `/api/core/accounts/${encodeURIComponent(id.value)}`, { key: `core:person:${id.value}` })
const person = computed(() => data.value)
const { data: held, refresh: refreshGrants } = await useAPI<{ grants: Grant[] }>('/api/core/grants', {
  query: { accountId: id },
  key: `core:person-grants:${id.value}`,
  immediate: false,
  default: () => ({ grants: [] }),
})
const { data: grantOptions, refresh: refreshOptions } = await useAPI<GrantOptions>('/api/core/grants/options', { key: 'core:grants:options', immediate: false })
watch(() => person.value?.actions.grants, (may) => {
  if (!may) return
  void refreshGrants()
  void refreshOptions()
}, { immediate: true })
const giving = ref(false)
const mayGive = computed(() => !!grantOptions.value?.manage && !!person.value && !person.value.anonymised && !person.value.disabled && !person.value.mergedInto)
const liveGrants = computed(() => (held.value?.grants ?? []).filter(g => !g.endedAt))

const state = computed(() => {
  const p = person.value
  if (!p) return 'active'
  return p.anonymised ? 'anonymised' : p.disabled ? 'disabled' : p.claimed ? 'active' : 'unclaimed'
})
const TONES = { active: 'success', unclaimed: 'neutral', disabled: 'warning', anonymised: 'neutral' } as const
const title = computed(() => person.value?.anonymised ? t('core.people.erased') : (person.value?.name ?? t('core.people.unnamed')))

const refusal = ref<RefusalView | null>(null)
/** One of this person's action routes. The path is built at run time, so it is a plain string. */
const at = (action: string): string => `/api/core/accounts/${encodeURIComponent(id.value)}/${action}`
async function act(run: () => Promise<unknown>, done: string) {
  refusal.value = null
  try {
    await run()
    toast.add({ title: done, color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Details (ID-46): the same limits as the person's own form. Undo puts back what was there.
const detailsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  pronouns: z.string().trim().max(40),
})
const editing = ref(false)
const details = reactive({ name: '', pronouns: '' })
const saving = ref(false)
const detailsRefusal = ref<RefusalView | null>(null)
function openDetails() {
  const p = person.value
  if (!p) return
  Object.assign(details, { name: p.name ?? '', pronouns: p.pronouns ?? '' })
  detailsRefusal.value = null
  editing.value = true
}
const patch = (body: Record<string, string | null>) => $api<unknown>(`/api/core/accounts/${encodeURIComponent(id.value)}`, { method: 'PATCH', body })
async function saveDetails() {
  const p = person.value
  if (!p) return
  const before = { pronouns: p.pronouns, ...(p.name ? { name: p.name } : {}) }
  saving.value = true
  detailsRefusal.value = null
  try {
    await patch({ name: details.name.trim(), pronouns: details.pronouns.trim() || null })
    editing.value = false
    // A nameless account cannot be made nameless again, so Undo there keeps the name.
    offer(t('core.person.details.saved'), async () => {
      await patch(before)
      await refresh()
    })
    await refresh()
  }
  catch (e) {
    detailsRefusal.value = toRefusal(e)
  }
  finally {
    saving.value = false
  }
}

// Addresses (ID-46): an added one does nothing until its link is used; the server keeps ID-12's rules.
const addresses = (): string => at('addresses')
const addressAt = (a: Address): string => `${addresses()}/${encodeURIComponent(a.id)}`
const addingAddress = ref(false)
const newAddress = reactive({ address: '' })
const addressSchema = z.object({ address: z.email().max(254) })
const sendingLink = ref(false)
const addRefusal = ref<RefusalView | null>(null)
const heldBy = computed(() => addRefusal.value?.code === 'core.address.on-another-account' ? addRefusal.value.detail?.accountId : undefined)
function openAddAddress() {
  newAddress.address = ''
  addRefusal.value = null
  addingAddress.value = true
}
async function sendLink(address: string) {
  await $api<unknown>(addresses(), { method: 'POST', body: { address } })
  toast.add({ title: t('core.person.email.sent', { address }), color: 'success' })
  await refresh()
}
async function addAddress() {
  sendingLink.value = true
  addRefusal.value = null
  try {
    await sendLink(newAddress.address.trim())
    addingAddress.value = false
  }
  catch (e) {
    addRefusal.value = toRefusal(e)
  }
  finally {
    sendingLink.value = false
  }
}
async function writeTo(a: Address) {
  const was = person.value?.addresses.find(x => x.audience)
  refusal.value = null
  try {
    await $api<unknown>(addressAt(a), { method: 'PUT', body: { use: 'audience' } })
    offer(t('core.person.email.now-used', { address: a.address }), was
      ? async () => {
        await $api<unknown>(addressAt(was), { method: 'PUT', body: { use: 'audience' } })
        await refresh()
      }
      : undefined)
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
async function removeAddress(a: Address) {
  if (!await confirm({ verb: t('core.person.email.remove'), thing: a.address, consequence: t('core.person.email.remove-consequence'), button: t('core.person.email.remove') })) return
  await act(() => $api<unknown>(addressAt(a), { method: 'DELETE', body: {} }), t('core.person.email.removed', { address: a.address }))
}
function addressActions(a: Address): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = []
  const main: DropdownMenuItem[] = []
  if (a.verified && !a.audience) main.push({ label: t('core.person.email.use-audience'), icon: 'i-lucide-mail-check', onSelect: () => { void writeTo(a) } })
  if (!a.verified) {
    main.push({ label: t('core.person.email.resend'), icon: 'i-lucide-send', onSelect: () => {
      refusal.value = null
      sendLink(a.address).catch((e) => { refusal.value = toRefusal(e) })
    } })
  }
  if (main.length) groups.push(main)
  if (!a.audience) groups.push([{ label: t('core.person.email.remove'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { void removeAddress(a) } }])
  return groups
}

// Issue a passkey enrolment link: shown here once, for the member of staff to hand over.
const link = ref<{ link: string, expiresAt: number } | null>(null)
async function issueLink() {
  if (!await confirm({ verb: t('core.person.recover.verb'), thing: t('core.person.recover.thing', { name: title.value }), consequence: t('core.person.recover.consequence'), button: t('core.person.recover.button') })) return
  refusal.value = null
  try {
    link.value = await $api<{ link: string, expiresAt: number }>(at('enrolment-link'), { method: 'POST', body: {} })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const REASONS = ['security', 'conduct', 'requested', 'duplicate'] as const
const disabling = ref(false)
const reason = ref<typeof REASONS[number]>('requested')
async function disable() {
  disabling.value = false
  await act(() => $api<unknown>(at('disable'), { method: 'POST', body: { reason: reason.value } }), t('core.person.disable.done', { name: title.value }))
}
async function enable() {
  if (!await confirm({ verb: t('core.person.enable.verb'), thing: title.value, consequence: t('core.person.enable.consequence'), button: t('core.person.enable.button') })) return
  await act(() => $api<unknown>(at('enable'), { method: 'POST', body: {} }), t('core.person.enable.done', { name: title.value }))
}
async function endSessions() {
  if (!await confirm({ verb: t('core.person.sessions.verb'), thing: t('core.person.sessions.thing', { name: title.value }), consequence: t('core.person.sessions.consequence'), button: t('core.person.sessions.button') })) return
  await act(() => $api<unknown>(at('sessions'), { method: 'DELETE' }), t('core.person.sessions.done'))
}

// Start an erasure for somebody who asked another way (ID-35), saying how staff checked who they
// were. They still confirm it from the link sent to their address.
const CHECKS = ['in-person', 'document', 'email-reply', 'known'] as const
const erasing = ref(false)
const check = ref<typeof CHECKS[number]>('in-person')
const DATA_REQUESTS: string = '/api/core/data-requests'
async function erase() {
  erasing.value = false
  refusal.value = null
  try {
    const { id: requestId } = await $api<{ id: string }>(DATA_REQUESTS, { method: 'POST', body: { accountId: id.value, kind: 'erasure', identityCheck: check.value } })
    toast.add({ title: t('core.person.erase.done'), color: 'success' })
    await navigateTo(`/console/people/data-requests/${encodeURIComponent(requestId)}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// A standing is a role that opens the members' area, named by the server, or a fact, named here.
function standingLabel(s: { source: string, label?: string }) {
  if (s.label) return s.label
  const dot = s.source.indexOf('.')
  const key = `${s.source.slice(0, dot)}.facts.${s.source.slice(dot + 1)}.label`
  return te(key) ? t(key) : s.source
}

// Emergency contacts (ID-17): read only with a reason, which is recorded and shown to the person.
const READ_REASONS = ['emergency', 'incident', 'welfare-follow-up', 'activity-check'] as const
const askingWhy = ref(false)
const why = ref<typeof READ_REASONS[number]>('emergency')
const contacts = ref<Contact[] | null>(null)
async function readContacts() {
  askingWhy.value = false
  refusal.value = null
  try {
    contacts.value = (await $api<{ contacts: Contact[] }>(at('emergency-contacts'), { query: { reason: why.value } })).contacts
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Access needs the person shared with the welfare lead (ID-39). Each read is recorded.
const needs = ref<Needs | null>(null)
async function readNeeds() {
  refusal.value = null
  try {
    needs.value = await $api<Needs>(at('access-needs'), { query: { purpose: 'core.welfare' } })
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const SCHEME_TONES = { 'submitted': 'info', 'more-info': 'warning', 'accepted': 'success', 'rejected': 'neutral' } as const

const actions = computed<DropdownMenuItem[][]>(() => {
  const p = person.value
  if (!p || p.anonymised) return []
  const groups: DropdownMenuItem[][] = []
  if (p.actions.recover) groups.push([{ label: t('core.person.recover.button'), icon: 'i-lucide-key-round', onSelect: () => { void issueLink() } }])
  if (p.actions.merge && !p.mergedInto) groups.push([{ label: t('core.person.merge'), icon: 'i-lucide-merge', to: `/console/people/merge?survivorId=${encodeURIComponent(p.id)}` }])
  const ending: DropdownMenuItem[] = []
  if (p.actions.endSessions && p.liveSessions) ending.push({ label: t('core.person.sessions.button'), icon: 'i-lucide-log-out', onSelect: () => { void endSessions() } })
  if (p.actions.disable) {
    ending.push(p.disabled
      ? { label: t('core.person.enable.button'), icon: 'i-lucide-user-check', onSelect: () => { void enable() } }
      : { label: t('core.person.disable.button'), icon: 'i-lucide-user-x', color: 'error', onSelect: () => { disabling.value = true } })
  }
  if (ending.length) groups.push(ending)
  if (p.actions.erase) groups.push([{ label: t('core.person.erase.button'), icon: 'i-lucide-eraser', color: 'error', onSelect: () => { erasing.value = true } }])
  return groups
})

const summary = computed(() => {
  const p = person.value
  if (!p) return []
  return [
    { label: t('core.person.since'), value: day(p.createdAt) },
    { label: t('core.person.last-signed-in'), value: p.lastSignedInAt ? day(p.lastSignedInAt) : t('core.person.never') },
    { label: t('core.person.origin'), value: t(`core.person.origins.${p.origin}`) },
    { label: t('core.person.sessions.live'), value: t('core.person.sessions.devices', { count: p.liveSessions }) },
  ]
})
const trail = computed(() => [{ label: t('core.navigation.people.label'), to: '/console/people' }])
</script>

<template>
  <DataBoundary
    :data="data"
    :status="status"
    :error="error"
    @retry="refresh()"
  >
    <template #default="{ data: p }">
      <PageRecord
        :title="title"
        :status="{ label: t(`core.people.state.${state}`), tone: TONES[state] }"
        :actions="actions"
        :summary="summary"
        record-type="core.account"
        :record-id="p.id"
        :tabs="[{ id: 'overview', label: t('core.person.overview') }]"
        :trail="trail"
      >
        <template #aside>
          <PageSection :title="t('core.person.details.title')">
            <template
              v-if="p.actions.update"
              #actions
            >
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-pencil"
                :label="t('core.person.details.edit')"
                @click="openDetails"
              />
            </template>
            <dl class="space-y-2 text-sm">
              <div>
                <dt class="text-muted">
                  {{ t('core.person.details.name') }}
                </dt>
                <dd>{{ p.name ?? t('core.person.details.none') }}</dd>
              </div>
              <div>
                <dt class="text-muted">
                  {{ t('core.person.details.pronouns') }}
                </dt>
                <dd>{{ p.pronouns ?? t('core.person.details.none') }}</dd>
              </div>
            </dl>
            <!-- One card for who the person is: name, pronouns and their addresses. -->
            <FieldGroup
              :title="t('core.person.addresses')"
              class="mt-4"
            >
              <template
                v-if="p.actions.update"
                #actions
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-plus"
                  :label="t('core.person.email.add')"
                  :aria-label="t('core.person.email.add-long')"
                  @click="openAddAddress"
                />
              </template>
              <p
                v-if="!p.addresses.length"
                class="text-sm text-muted"
              >
                {{ t('core.person.no-addresses') }}
              </p>
              <RecordList
                v-else
                :label="t('core.person.addresses')"
              >
                <RecordListItem
                  v-for="a in p.addresses"
                  :key="a.id"
                >
                  <template #name>
                    <span class="break-all">{{ a.address }}</span>
                  </template>
                  <div class="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      :tone="a.verified ? 'success' : 'neutral'"
                      :label="a.verified ? t('core.person.verified') : t('core.person.unverified')"
                    />
                    <StatusBadge
                      v-if="a.audience"
                      tone="info"
                      :label="t('core.person.email.audience')"
                    />
                  </div>
                  <RowActions
                    v-if="p.actions.update"
                    :items="addressActions(a)"
                    :label="t('core.person.email.actions', { address: a.address })"
                  />
                </RecordListItem>
              </RecordList>
            </FieldGroup>
          </PageSection>
        </template>

        <template #tab-overview>
          <div class="space-y-6">
            <RefusalNotice :refusal="refusal" />
            <UAlert
              v-if="p.disabled"
              color="warning"
              variant="subtle"
              icon="i-lucide-user-x"
              :title="t('core.person.disabled-since', { day: day(p.disabled.at) })"
              :description="p.disabled.reason ? t(`core.person.disable.reasons.${p.disabled.reason}`) : undefined"
            />

            <PageSection :title="t('core.person.sign-in.title')">
              <p
                v-if="!p.passkeys.length && !p.providers.length"
                class="text-sm text-muted"
              >
                {{ t('core.person.sign-in.email-only') }}
              </p>
              <RecordList
                v-if="p.passkeys.length"
                :label="t('core.person.sign-in.passkeys')"
              >
                <RecordListItem
                  v-for="k in p.passkeys"
                  :key="k.id"
                  :name="k.label"
                  :description="k.lastUsedAt ? t('core.person.sign-in.last-used', { when: dateTime(k.lastUsedAt) }) : t('core.person.sign-in.added', { day: day(k.addedAt) })"
                />
              </RecordList>
              <p
                v-for="provider in p.providers"
                :key="provider"
                class="text-sm"
              >
                {{ t('core.person.sign-in.provider', { provider: provider === 'google' ? 'Google' : provider }) }}
              </p>
            </PageSection>

            <PageSection
              v-if="p.actions.grants"
              :title="t('core.person.roles.title')"
            >
              <template
                v-if="mayGive"
                #actions
              >
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-user-plus"
                  :label="t('core.grants.give.open')"
                  @click="giving = true"
                />
              </template>
              <p
                v-if="!liveGrants.length"
                class="text-sm text-muted"
              >
                {{ t('core.person.roles.none') }}
              </p>
              <RecordList
                v-else
                :label="t('core.person.roles.title')"
              >
                <RecordListItem
                  v-for="g in liveGrants"
                  :key="g.id"
                  :name="g.role"
                  :description="g.expiresAt ? t('core.person.roles.until', { day: day(g.expiresAt) }) : t('core.person.roles.no-end')"
                />
              </RecordList>
            </PageSection>

            <PageSection :title="t('core.person.standings.title')">
              <p
                v-if="!p.standings.length"
                class="text-sm text-muted"
              >
                {{ t('core.person.standings.none') }}
              </p>
              <template v-else>
                <p class="text-sm">
                  {{ t('core.person.standings.member') }}
                </p>
                <ul class="mt-2 list-disc space-y-1 ps-5 text-sm">
                  <li
                    v-for="s in p.standings"
                    :key="s.source"
                  >
                    {{ standingLabel(s) }}
                  </li>
                </ul>
              </template>
            </PageSection>

            <PageSection
              v-if="p.actions.emergencyContacts"
              :title="t('core.person.contacts.title')"
              :description="t('core.person.contacts.description')"
            >
              <UButton
                v-if="!contacts"
                color="neutral"
                variant="outline"
                icon="i-lucide-phone"
                :label="t('core.person.contacts.read')"
                @click="askingWhy = true"
              />
              <p
                v-else-if="!contacts.length"
                class="text-sm text-muted"
              >
                {{ t('core.person.contacts.none') }}
              </p>
              <RecordList
                v-else
                :label="t('core.person.contacts.title')"
              >
                <RecordListItem
                  v-for="(c, n) in contacts"
                  :key="n"
                  :name="c.relationship ? t('core.person.contacts.who', { name: c.name, relationship: c.relationship }) : c.name"
                  :description="c.phone"
                />
              </RecordList>
            </PageSection>

            <PageSection
              v-if="p.actions.accessScheme || p.actions.accessNeeds"
              :title="t('core.person.access.title')"
            >
              <div class="space-y-3">
                <div
                  v-if="p.actions.accessScheme"
                  class="flex flex-wrap items-center gap-3 text-sm"
                >
                  <StatusBadge
                    v-if="p.accessScheme"
                    :tone="SCHEME_TONES[p.accessScheme.status]"
                    :label="t(`core.person.access.status.${p.accessScheme.status}`)"
                  />
                  <span
                    v-else
                    class="text-muted"
                  >{{ t('core.person.access.not-applied') }}</span>
                  <UButton
                    :to="`/console/people/access-scheme/${encodeURIComponent(p.id)}`"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    trailing-icon="i-lucide-arrow-right"
                    :label="t('core.person.access.open')"
                  />
                </div>
                <template v-if="p.actions.accessNeeds">
                  <UButton
                    v-if="!needs"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-accessibility"
                    :label="t('core.person.access.read')"
                    @click="readNeeds"
                  />
                  <p
                    v-else-if="!needs.shared || !needs.needs?.length"
                    class="text-sm text-muted"
                  >
                    {{ t('core.person.access.none') }}
                  </p>
                  <ul
                    v-else
                    class="list-disc space-y-1 ps-5 text-sm"
                  >
                    <li
                      v-for="need in needs.needs"
                      :key="need.key"
                    >
                      {{ need.label }}<template v-if="need.note">
                        : {{ need.note }}
                      </template>
                    </li>
                    <li v-if="needs.companions">
                      {{ t('core.person.access.companions', { count: needs.companions }) }}
                    </li>
                  </ul>
                  <p class="text-xs text-muted">
                    {{ t('core.person.access.recorded') }}
                  </p>
                </template>
              </div>
            </PageSection>
          </div>
        </template>
      </PageRecord>

      <GiveRoleDialog
        v-if="mayGive && grantOptions"
        v-model:open="giving"
        :options="grantOptions"
        :person="{ id: p.id, name: title }"
        @changed="refreshGrants()"
      />

      <UModal
        v-model:open="editing"
        :title="t('core.person.details.edit-title', { name: title })"
      >
        <template #body>
          <UForm
            id="person-details"
            :schema="detailsSchema"
            :state="details"
            class="space-y-4"
            novalidate
            @submit="saveDetails"
          >
            <RefusalNotice :refusal="detailsRefusal" />
            <UFormField
              name="name"
              :label="t('core.person.details.name')"
              required
            >
              <UInput
                v-model="details.name"
                autocomplete="off"
                maxlength="120"
              />
            </UFormField>
            <UFormField
              name="pronouns"
              :label="t('core.person.details.pronouns')"
            >
              <UInput
                v-model="details.pronouns"
                autocomplete="off"
                maxlength="40"
              />
            </UFormField>
          </UForm>
        </template>
        <template #footer>
          <UButton
            type="submit"
            form="person-details"
            :loading="saving"
            :label="t('core.person.details.save')"
          />
        </template>
      </UModal>

      <UModal
        v-model:open="addingAddress"
        :title="t('core.person.email.add-title', { name: title })"
        :description="t('core.person.email.add-help')"
      >
        <template #body>
          <UForm
            id="person-address"
            :schema="addressSchema"
            :state="newAddress"
            class="space-y-4"
            novalidate
            @submit="addAddress"
          >
            <RefusalNotice :refusal="addRefusal" />
            <UButton
              v-if="heldBy"
              color="neutral"
              variant="outline"
              icon="i-lucide-merge"
              :label="t('core.person.email.merge')"
              :to="`/console/people/merge?survivorId=${encodeURIComponent(p.id)}&mergedAccountId=${encodeURIComponent(heldBy)}`"
            />
            <UFormField
              name="address"
              :label="t('core.person.email.address')"
              required
            >
              <UInput
                v-model="newAddress.address"
                type="email"
                autocomplete="off"
                maxlength="254"
              />
            </UFormField>
          </UForm>
        </template>
        <template #footer>
          <UButton
            type="submit"
            form="person-address"
            :loading="sendingLink"
            :label="t('core.person.email.send-link')"
          />
        </template>
      </UModal>

      <UModal
        v-model:open="disabling"
        :title="t('core.person.disable.title', { name: title })"
        :description="t('core.person.disable.consequence')"
      >
        <template #body>
          <UFormField :label="t('core.person.disable.reason')">
            <URadioGroup
              v-model="reason"
              :items="REASONS.map(r => ({ value: r, label: t(`core.person.disable.reasons.${r}`) }))"
            />
          </UFormField>
        </template>
        <template #footer>
          <UButton
            color="error"
            :label="t('core.person.disable.button')"
            @click="disable"
          />
        </template>
      </UModal>

      <UModal
        v-model:open="askingWhy"
        :title="t('core.person.contacts.why-title', { name: title })"
        :description="t('core.person.contacts.why-description')"
      >
        <template #body>
          <UFormField :label="t('core.person.contacts.why')">
            <URadioGroup
              v-model="why"
              :items="READ_REASONS.map(r => ({ value: r, label: t(`core.person.contacts.reasons.${r}`) }))"
            />
          </UFormField>
        </template>
        <template #footer>
          <UButton
            :label="t('core.person.contacts.read')"
            @click="readContacts"
          />
        </template>
      </UModal>

      <UModal
        v-model:open="erasing"
        :title="t('core.person.erase.title', { name: title })"
        :description="t('core.person.erase.description')"
      >
        <template #body>
          <UFormField :label="t('core.person.erase.check')">
            <URadioGroup
              v-model="check"
              :items="CHECKS.map(c => ({ value: c, label: t(`core.data-request.identity-checks.${c}`) }))"
            />
          </UFormField>
        </template>
        <template #footer>
          <UButton
            color="error"
            :label="t('core.person.erase.button')"
            @click="erase"
          />
        </template>
      </UModal>

      <UModal
        :open="!!link"
        :title="t('core.person.recover.shown-title')"
        :description="t('core.person.recover.shown-description', { when: link ? dateTime(link.expiresAt) : '' })"
        @update:open="(open: boolean) => { if (!open) link = null }"
      >
        <template #body>
          <UInput
            :model-value="link?.link"
            readonly
            :aria-label="t('core.person.recover.link')"
          />
        </template>
      </UModal>
    </template>
  </DataBoundary>
</template>
