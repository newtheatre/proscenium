/**
 * Admin: the emergency card per venue, and the numbers the door may need.
 * Both are read by `/foh` on a show night (docs/11 §2.5, §2.6).
 */
<script setup lang="ts">
import { canManageFoh } from '~~/shared/utils/abilities'

definePageMeta({
  layout: 'admin',
  middleware: ['staff'],
  title: 'Front of house',
})

interface EmergencyRow {
  venueId: string
  venueName: string
  venueAddress: string | null
  addressForEmergencyCall: string | null
  what3words: string | null
  evacuationProcedure: string | null
  assemblyPoint: string | null
  firstAidLocation: string | null
  defibrillatorLocation: string | null
  isolationPoints: string | null
  firePanelLocation: string | null
}

interface Contact {
  id: string
  label: string
  phone: string
  kind: string
  note: string | null
  sort: number
  archived: boolean
}

const FIELDS = [
  { key: 'addressForEmergencyCall', label: 'Address to read to 999' },
  { key: 'what3words', label: 'what3words' },
  { key: 'assemblyPoint', label: 'Assembly point' },
  { key: 'evacuationProcedure', label: 'Evacuation procedure' },
  { key: 'firstAidLocation', label: 'First aid kit' },
  { key: 'defibrillatorLocation', label: 'Defibrillator' },
  { key: 'firePanelLocation', label: 'Fire panel' },
  { key: 'isolationPoints', label: 'Isolation points' },
] as const

const { user } = useUserSession()
const canEdit = computed(() => (user.value ? canManageFoh(user.value) : false))
const toast = useToast()
const requestFetch = useRequestFetch()

const { data: venueData, refresh: refreshVenues } = await useAsyncData(
  'admin-foh-emergency',
  () => requestFetch<EmergencyRow[]>('/api/admin/foh/emergency'),
)
const { data: contactData, refresh: refreshContacts } = await useAsyncData(
  'admin-foh-contacts',
  () => requestFetch<Contact[]>('/api/admin/foh/contacts'),
)

const venues = computed<EmergencyRow[]>(() => venueData.value ?? [])
const contacts = computed<Contact[]>(() => contactData.value ?? [])

const drafts = ref<Record<string, Record<string, string>>>({})
watchEffect(() => {
  for (const venue of venues.value) {
    if (drafts.value[venue.venueId]) continue
    drafts.value[venue.venueId] = Object.fromEntries(
      FIELDS.map(field => [field.key, (venue[field.key] as string | null) ?? '']),
    )
  }
})

/**
 * An unfilled emergency card is a safety gap, so the table shows how complete
 * each one is rather than making someone open all of them to find out.
 */
function filledCount(venue: EmergencyRow): number {
  return FIELDS.filter(field => (venue[field.key] as string | null)?.trim()).length
}

const editingVenueId = ref<string | null>(null)
const editingVenue = computed(() => venues.value.find(v => v.venueId === editingVenueId.value) ?? null)

const saving = ref<string | null>(null)
async function saveVenue(venueId: string) {
  saving.value = venueId
  try {
    await requestFetch(`/api/admin/foh/emergency/${venueId}`, {
      method: 'PUT',
      body: Object.fromEntries(
        Object.entries(drafts.value[venueId] ?? {}).map(([k, v]) => [k, v.trim() || null]),
      ),
    })
    await refreshVenues()
    editingVenueId.value = null
    toast.add({ title: 'Emergency card saved', color: 'success' })
  }
  catch {
    toast.add({ title: 'That did not save', color: 'error' })
  }
  finally {
    saving.value = null
  }
}

const newContact = ref({ label: '', phone: '', kind: 'OTHER', note: '', sort: 0 })
async function addContact() {
  if (!newContact.value.label.trim() || !newContact.value.phone.trim()) return
  try {
    await requestFetch('/api/admin/foh/contacts', { method: 'POST', body: newContact.value })
    newContact.value = { label: '', phone: '', kind: 'OTHER', note: '', sort: 0 }
    await refreshContacts()
  }
  catch {
    toast.add({ title: 'That contact was not added', color: 'error' })
  }
}

async function setArchived(contact: Contact, archived: boolean) {
  try {
    await requestFetch(`/api/admin/foh/contacts/${contact.id}`, { method: 'PUT', body: { archived } })
    await refreshContacts()
  }
  catch {
    toast.add({ title: 'That did not save', color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-2xl font-semibold">
        Front of house
      </h1>
      <p class="text-sm text-muted">
        What the show night screen shows when something goes wrong. Kept off the public venue
        record on purpose.
      </p>
    </div>

    <section class="space-y-4">
      <div>
        <h2 class="text-lg font-medium">
          Emergency cards
        </h2>
        <p class="text-sm text-muted">
          One per venue, read out on the show night screen. Open a venue to fill it in.
        </p>
      </div>

      <UCard>
        <ul class="divide-y divide-default">
          <li
            v-for="venue in venues"
            :key="venue.venueId"
            class="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div>
              <p class="font-medium">
                {{ venue.venueName }}
              </p>
              <p
                v-if="venue.venueAddress"
                class="text-sm text-muted"
              >
                {{ venue.venueAddress }}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <UBadge
                variant="subtle"
                :color="filledCount(venue) === 0 ? 'error' : filledCount(venue) < FIELDS.length ? 'warning' : 'success'"
              >
                {{ filledCount(venue) }} of {{ FIELDS.length }} filled
              </UBadge>
              <UButton
                size="sm"
                variant="subtle"
                :label="canEdit ? 'Edit' : 'View'"
                @click="editingVenueId = venue.venueId"
              />
            </div>
          </li>
          <li
            v-if="!venues.length"
            class="py-3 text-sm text-muted"
          >
            No venues yet.
          </li>
        </ul>
      </UCard>
    </section>

    <section class="space-y-4">
      <h2 class="text-lg font-medium">
        Contacts
      </h2>

      <UCard v-if="canEdit">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Label">
            <UInput
              v-model="newContact.label"
              placeholder="Committee on-call"
            />
          </UFormField>
          <UFormField label="Phone">
            <UInput
              v-model="newContact.phone"
              placeholder="07700 900000"
            />
          </UFormField>
          <UFormField label="Kind">
            <USelect
              v-model="newContact.kind"
              :items="['COMMITTEE', 'VENUE', 'SECURITY', 'TAXI', 'OTHER']"
            />
          </UFormField>
          <UFormField label="Note">
            <UInput
              v-model="newContact.note"
              placeholder="Optional"
            />
          </UFormField>
        </div>
        <template #footer>
          <UButton
            label="Add contact"
            @click="addContact"
          />
        </template>
      </UCard>

      <UCard>
        <ul class="divide-y divide-default">
          <li
            v-for="contact in contacts"
            :key="contact.id"
            class="flex items-center justify-between gap-3 py-3"
          >
            <div :class="contact.archived ? 'opacity-50' : ''">
              <p class="font-medium">
                {{ contact.label }}
                <UBadge
                  v-if="contact.archived"
                  size="sm"
                  variant="soft"
                  color="neutral"
                >
                  archived
                </UBadge>
              </p>
              <p class="text-sm text-muted">
                {{ contact.phone }}<template v-if="contact.note">
                  · {{ contact.note }}
                </template>
              </p>
            </div>
            <UButton
              v-if="canEdit"
              size="xs"
              variant="ghost"
              :label="contact.archived ? 'Restore' : 'Archive'"
              @click="setArchived(contact, !contact.archived)"
            />
          </li>
        </ul>
        <p
          v-if="!contacts.length"
          class="text-sm text-muted"
        >
          No contacts yet.
        </p>
      </UCard>
    </section>

    <UModal
      :open="editingVenueId !== null"
      :title="`Emergency card — ${editingVenue?.venueName ?? ''}`"
      @update:open="value => { if (!value) editingVenueId = null }"
    >
      <template #body>
        <div
          v-if="editingVenueId && drafts[editingVenueId]"
          class="space-y-3"
        >
          <UFormField
            v-for="field in FIELDS"
            :key="field.key"
            :label="field.label"
          >
            <UTextarea
              v-model="drafts[editingVenueId]![field.key]"
              :rows="field.key === 'evacuationProcedure' ? 4 : 2"
              :disabled="!canEdit"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Close"
            @click="editingVenueId = null"
          />
          <UButton
            v-if="canEdit"
            :loading="saving === editingVenueId"
            label="Save"
            @click="saveVenue(editingVenueId!)"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
