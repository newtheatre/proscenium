<script setup lang="ts">
import { h, resolveComponent } from 'vue'
import { EXTERNAL_REASON_LIMIT, saysExternalStatus } from '#shared/utils/external-requests'
import { saysVerdict } from '#shared/utils/external-spaces'
import { describePurpose } from '#shared/utils/bookings'
import { formatLondon } from '#shared/utils/london'
import type { ActiveFilter } from '~/components/AdminToolbar.vue'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'admin', title: 'Other room requests', middleware: 'signed-in' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

interface Offer { id: string, space: string, outcome: string, reason: string | null, by: string | null }

interface Request {
  id: string
  who: string
  title: string
  purpose: string
  attendees: number | null
  startsAt: number
  endsAt: number
  preferred: string | null
  preferredSpaceId: string | null
  preferredWarning: string | null
  assigned: string | null
  notes: string | null
  suReference: string | null
  status: string
  rejectionReason: string | null
  offers: Offer[]
}

const toast = useToast()
const when = ref<'open' | 'all'>('open')
const search = ref('')
const listing = ref<{ items: Request[], total: number } | null>(null)
const loading = ref(false)
const failure = ref<string | null>(null)
const working = ref(false)

const submitting = ref<Request | null>(null)
const assigning = ref<Request | null>(null)
const refusing = ref<Request | null>(null)
const rejecting = ref<Request | null>(null)

const reference = ref('')
const chosenSpace = ref<string | undefined>()
const despite = ref(false)
const blockedBy = ref<{ verdict: string, reason: string } | null>(null)
const inModal = ref<string | null>(null)
const refusalReason = ref('')
const noteToo = ref(true)
const noteVerdict = ref<'CAUTION' | 'UNSUITABLE'>('UNSUITABLE')
const rejectionReason = ref('')

async function load(): Promise<void> {
  loading.value = true
  failure.value = null
  try {
    listing.value = await $fetch<{ items: Request[], total: number }>('/api/admin/rooms/external-requests', {
      query: { when: when.value },
    })
  }
  catch (error) {
    failure.value = refusalText(error)
  }
  finally {
    loading.value = false
  }
}

const shown = computed(() => {
  const items = listing.value?.items ?? []
  const term = search.value.trim().toLowerCase()
  if (!term) return items
  return items.filter(one => [one.who, one.title, one.preferred ?? '', one.assigned ?? '']
    .some(field => field.toLowerCase().includes(term)))
})

function span(one: Request): string {
  const from = formatLondon(new Date(one.startsAt * 1000), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const to = formatLondon(new Date(one.endsAt * 1000), { hour: '2-digit', minute: '2-digit' })
  return `${from} to ${to}`
}

async function act(path: string, body: Record<string, unknown>, said: string): Promise<boolean> {
  working.value = true
  failure.value = null
  try {
    await $fetch(path, { method: 'POST', body })
    toast.add({ title: said, icon: 'i-lucide-check', color: 'success' })
    await load()
    return true
  }
  catch (error) {
    // The one refusal a person may override: the room is one we have marked no good.
    const data = refusalData<{ note?: { verdict: string, reason: string }, needsDespite?: boolean }>(error)
    if (data?.needsDespite && data.note) {
      blockedBy.value = data.note
      return false
    }
    // Shown inside the modal: the page-root alert sits behind the overlay, so a 409 from a
    // colleague acting first read as the button simply doing nothing.
    inModal.value = refusalText(error)
    return false
  }
  finally {
    working.value = false
  }
}

async function submit(): Promise<void> {
  const one = submitting.value
  if (!one) return
  if (await act(`/api/admin/rooms/external-requests/${one.id}/submit`, { suReference: reference.value }, 'Requested')) {
    submitting.value = null
  }
}

async function assign(): Promise<void> {
  const one = assigning.value
  if (!one || !chosenSpace.value) return
  const done = await act(`/api/admin/rooms/external-requests/${one.id}/assign`, {
    spaceId: chosenSpace.value,
    suReference: reference.value || null,
    despite: despite.value,
  }, 'Room recorded, and the member told')
  if (done) assigning.value = null
}

async function refuse(): Promise<void> {
  const one = refusing.value
  if (!one || !chosenSpace.value) return
  const done = await act(`/api/admin/rooms/external-requests/${one.id}/refuse-assignment`, {
    spaceId: chosenSpace.value,
    reason: refusalReason.value,
    note: noteToo.value ? { verdict: noteVerdict.value, reason: refusalReason.value } : null,
  }, 'Recorded, and asked again')
  if (done) refusing.value = null
}

async function reject(): Promise<void> {
  const one = rejecting.value
  if (!one) return
  if (await act(`/api/admin/rooms/external-requests/${one.id}/reject`, { reason: rejectionReason.value }, 'Turned down')) {
    rejecting.value = null
  }
}

// An override is asserted about one room, so changing the room withdraws it. Without this, a
// despite ticked for a room we know is no good waves the next room through unseen.
watch(chosenSpace, () => {
  despite.value = false
  blockedBy.value = null
})

function begin(which: 'submit' | 'assign' | 'refuse' | 'reject', one: Request): void {
  inModal.value = null
  reference.value = one.suReference ?? ''
  // Never pre-selected. SpacePicker renders nothing until a search returns, so a value set here
  // arms the button while the box still looks empty, and one click records the wrong room.
  chosenSpace.value = undefined
  despite.value = false
  blockedBy.value = null
  refusalReason.value = ''
  noteToo.value = true
  noteVerdict.value = 'UNSUITABLE'
  rejectionReason.value = ''

  if (which === 'submit') submitting.value = one
  if (which === 'assign') assigning.value = one
  if (which === 'refuse') refusing.value = one
  if (which === 'reject') rejecting.value = one
}

const activeFilters = computed<ActiveFilter[]>(() => {
  const active: ActiveFilter[] = []
  if (search.value) {
    active.push({ key: 'search', label: `Matching ${search.value}`, icon: 'i-lucide-search', clear: () => {
      search.value = ''
    } })
  }
  if (when.value !== 'open') {
    active.push({ key: 'when', label: 'Including settled', icon: 'i-lucide-history', clear: () => {
      when.value = 'open'
    } })
  }
  return active
})

watch(when, load)

const columns = computed<TableColumn<Request>[]>(() => [
  {
    id: 'who',
    header: 'Who and what',
    cell: ({ row }) => h('div', {}, [
      h('div', {}, row.original.who),
      h('div', { class: 'text-xs text-muted' }, `${row.original.title} (${describePurpose(row.original.purpose)})`),
      row.original.attendees
        ? h('div', { class: 'text-xs text-muted' }, plural(row.original.attendees, 'person', 'people'))
        : null,
      // Written by the member for the form, so the person filling it in has to see it.
      row.original.notes ? h('p', { class: 'mt-1 text-sm' }, row.original.notes) : null,
    ]),
  },
  {
    id: 'when',
    header: 'When',
    meta: { class: { td: 'whitespace-nowrap text-sm' } },
    cell: ({ row }) => span(row.original),
  },
  {
    id: 'room',
    header: 'Room',
    cell: ({ row }) => h('div', { class: 'space-y-1 text-sm' }, [
      row.original.assigned
        ? h('div', {}, [h('span', { class: 'font-medium' }, row.original.assigned), h('span', { class: 'text-muted' }, ' given')])
        : h('div', { class: 'text-muted' }, row.original.preferred ? `${row.original.preferred} asked for` : 'No preference'),
      row.original.preferredWarning && !row.original.assigned
        ? h(UBadge, { color: 'warning', variant: 'subtle', size: 'sm' }, () => row.original.preferredWarning)
        : null,
      ...row.original.offers.filter(offer => offer.outcome === 'REFUSED').map(offer =>
        h('div', { class: 'text-xs text-muted' }, `${offer.space} refused: ${offer.reason}`)),
    ]),
  },
  {
    id: 'status',
    header: 'Where it is',
    cell: ({ row }) => h('div', {}, [
      h(UBadge, {
        color: row.original.status === 'CONFIRMED' ? 'success' : row.original.status === 'AWAITING_EXTERNAL' ? 'info' : 'neutral',
        variant: 'subtle',
        size: 'sm',
      }, () => saysExternalStatus(row.original.status)),
      row.original.rejectionReason ? h('p', { class: 'mt-1 text-xs text-muted' }, row.original.rejectionReason) : null,
    ]),
  },
  {
    id: 'act',
    header: '',
    meta: { class: { td: 'text-right whitespace-nowrap' } },
    cell: ({ row }) => h('div', { class: 'flex justify-end gap-1' }, [
      row.original.status === 'REQUESTED'
        ? h(UButton, {
            'size': 'sm',
            'variant': 'subtle',
            'data-test': `submit-${row.original.id}`,
            'onClick': () => begin('submit', row.original),
          }, () => 'Form is in')
        : null,
      row.original.status === 'AWAITING_EXTERNAL'
        ? h(UButton, {
            'size': 'sm',
            'variant': 'subtle',
            'data-test': `assign-${row.original.id}`,
            'onClick': () => begin('assign', row.original),
          }, () => 'They gave us')
        : null,
      row.original.status === 'AWAITING_EXTERNAL'
        ? h(UButton, {
            'size': 'sm',
            'color': 'warning',
            'variant': 'ghost',
            'data-test': `refuse-${row.original.id}`,
            'onClick': () => begin('refuse', row.original),
          }, () => 'No good')
        : null,
      row.original.status === 'REQUESTED' || row.original.status === 'AWAITING_EXTERNAL'
        ? h(UButton, {
            'size': 'sm',
            'color': 'error',
            'variant': 'ghost',
            'data-test': `reject-${row.original.id}`,
            'onClick': () => begin('reject', row.original),
          }, () => 'Turn down')
        : null,
    ]),
  },
])

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="failure"
      data-test="failure"
      color="error"
      variant="subtle"
      :description="failure"
    />

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-map-pin"
      title="Rooms we do not manage, tracked"
      description="A member asks, you fill in the form, they answer, and you record what we were given. If it is no good, say so and ask again: what was offered is kept either way, so next time we know."
    />

    <AdminToolbar
      v-model:search="search"
      placeholder="A name, a title or a room"
      :active="activeFilters"
      :loading="loading"
      @clear="search = ''; when = 'open'"
    >
      <template #filters>
        <UFormField label="Show">
          <USelect
            v-model="when"
            data-test="su-requests-when"
            :items="[{ label: 'Still open', value: 'open' }, { label: 'Including settled', value: 'all' }]"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </template>
    </AdminToolbar>

    <UTable
      :data="shown"
      :columns="columns"
      :loading="loading"
      data-test="su-requests-table"
    >
      <template #empty>
        <p class="py-6 text-center text-sm text-muted">
          Nothing is waiting on anybody else.
        </p>
      </template>
    </UTable>

    <p
      data-test="su-requests-total"
      class="text-sm text-muted"
    >
      {{ plural(shown.length, 'request') }}
    </p>

    <UModal
      :open="submitting !== null"
      title="The form is in"
      description="The member is told it is with them. Their reference, if they gave you one, makes reconciling the two sides possible later."
      @update:open="submitting = null"
    >
      <template #body>
        <UAlert
          v-if="inModal"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="inModal"
          data-test="modal-failure"
        />
        <UFormField
          label="Their reference"
          hint="Optional"
        >
          <UInput
            v-model="reference"
            class="w-full"
            data-test="submit-reference"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          :loading="working"
          data-test="submit-confirm"
          @click="submit"
        >
          It is with them
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="submitting = null"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="assigning !== null"
      title="What did they give us?"
      description="Recording the room confirms the request and tells the member which room they have."
      @update:open="assigning = null"
    >
      <template #body>
        <UAlert
          v-if="inModal"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="inModal"
          data-test="modal-failure"
        />
        <div class="space-y-4">
          <UFormField
            label="The room"
            required
          >
            <SpacePicker
              v-model="chosenSpace"
              :purpose="assigning?.purpose ?? null"
            />
          </UFormField>

          <UFormField
            label="Their reference"
            hint="Optional"
          >
            <UInput
              v-model="reference"
              class="w-full"
            />
          </UFormField>

          <!-- The spreadsheet check, made into something that stops you rather than something
               you read past. -->
          <UAlert
            v-if="blockedBy"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="We know this room is no good for that"
            data-test="assign-blocked"
          >
            <template #description>
              <p>{{ blockedBy.reason }}</p>
              <UCheckbox
                v-model="despite"
                class="mt-3"
                label="Record it anyway"
                data-test="assign-despite"
              />
            </template>
          </UAlert>
        </div>
      </template>
      <template #footer>
        <UButton
          :loading="working"
          :disabled="!chosenSpace || (blockedBy !== null && !despite)"
          data-test="assign-confirm"
          @click="assign"
        >
          That is the room
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="assigning = null"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="refusing !== null"
      title="That room is no good"
      description="Recorded against the room, so the next person asking for it is warned. The request stays open."
      @update:open="refusing = null"
    >
      <template #body>
        <UAlert
          v-if="inModal"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="inModal"
          data-test="modal-failure"
        />
        <div class="space-y-4">
          <UFormField
            label="Which room they offered"
            required
          >
            <SpacePicker
              v-model="chosenSpace"
              :purpose="refusing?.purpose ?? null"
            />
          </UFormField>

          <UFormField
            label="What was wrong with it"
            required
            :description="`Up to ${EXTERNAL_REASON_LIMIT} characters.`"
          >
            <UTextarea
              v-model="refusalReason"
              :rows="3"
              :maxlength="EXTERNAL_REASON_LIMIT"
              class="w-full"
              data-test="refuse-reason"
            />
          </UFormField>

          <UFormField
            v-if="noteToo"
            label="How bad is it"
            description="A one-off problem is a caution. Unsuitable refuses the room outright next time."
          >
            <div class="flex flex-wrap gap-1">
              <UButton
                v-for="verdict in ['CAUTION', 'UNSUITABLE'] as const"
                :key="verdict"
                size="sm"
                :color="noteVerdict === verdict ? (verdict === 'UNSUITABLE' ? 'error' : 'warning') : 'neutral'"
                :variant="noteVerdict === verdict ? 'solid' : 'outline'"
                :aria-pressed="noteVerdict === verdict"
                :data-test="`refuse-verdict-${verdict}`"
                @click="noteVerdict = verdict"
              >
                {{ saysVerdict(verdict) }}
              </UButton>
            </div>
          </UFormField>

          <UCheckbox
            v-model="noteToo"
            :label="`Remember this about the room for ${describePurpose(refusing?.purpose ?? null).toLowerCase()}`"
            description="So the next person asking for it is warned before anybody is troubled."
            data-test="refuse-note"
          />
        </div>
      </template>
      <template #footer>
        <UButton
          color="warning"
          :loading="working"
          :disabled="!chosenSpace || !refusalReason.trim()"
          data-test="refuse-confirm"
          @click="refuse"
        >
          Ask them again
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="refusing = null"
        >
          Back
        </UButton>
      </template>
    </UModal>

    <UModal
      :open="rejecting !== null"
      title="Say why"
      description="The member is shown this word for word, so write it to them."
      @update:open="rejecting = null"
    >
      <template #body>
        <UAlert
          v-if="inModal"
          class="mb-4"
          color="error"
          variant="subtle"
          :description="inModal"
          data-test="modal-failure"
        />
        <UFormField
          label="Why it is not being requested"
          required
        >
          <UTextarea
            v-model="rejectionReason"
            :rows="3"
            :maxlength="EXTERNAL_REASON_LIMIT"
            class="w-full"
            data-test="su-reject-reason"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          color="error"
          :loading="working"
          :disabled="!rejectionReason.trim()"
          data-test="su-reject-confirm"
          @click="reject"
        >
          Turn it down
        </UButton>
        <UButton
          color="neutral"
          variant="ghost"
          @click="rejecting = null"
        >
          Back
        </UButton>
      </template>
    </UModal>
  </div>
</template>
