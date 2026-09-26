<script setup lang="ts">
import { can, editSettings, viewBoardConfig, viewChecklist, viewEmergencyCard } from '#shared/utils/abilities'
import { MAX_PAGE_SIZE } from '#shared/utils/pagination'
import { saysShiftRole } from '#shared/utils/rota'
import { ELIGIBILITY_KEYS, saysChecklistReadiness, saysEligibility, venueReady } from '#shared/utils/rota-readiness'
import type { ShiftRole } from '#shared/utils/rota'
import type { BoardReadiness, RoleEligibility, VenueReadiness } from '#shared/utils/rota-readiness'

// What a show night needs set up, on one card for the rota's owner (issue 1318). Each role's gate
// reads to anybody with the rota; only a settings editor gets a field to change it (0040).

interface Readiness { eligibility: RoleEligibility[], venues: VenueReadiness[], board: BoardReadiness }
interface ModuleCandidate { id: string, name: string }

const request = useRequestFetch()
const toast = useToast()
const viewer = useViewer()
const edits = computed(() => can(viewer.value, editSettings))
// A line links to the screen that fixes it only for a reader who may open that screen (0040).
const fixes = computed(() => ({
  checklists: can(viewer.value, viewChecklist) ? '/rota/manage/checklists' : undefined,
  cards: can(viewer.value, viewEmergencyCard) ? '/rota/manage/emergency' : undefined,
  board: can(viewer.value, viewBoardConfig) ? '/rota/manage/backstage' : undefined,
}))

const [{ data, error, refresh }, { data: modules }] = await Promise.all([
  useAsyncData(
    'rota-readiness',
    () => request<Readiness>('/api/admin/rota/readiness'),
    { default: (): Readiness => ({ eligibility: [], venues: [], board: { presets: 0, milestones: 0 } }) },
  ),
  // Every module is a candidate here, not the current page of some other table's search (K-129).
  useAsyncData(
    'rota-readiness-modules',
    () => (edits.value
      ? request<{ items: ModuleCandidate[] }>('/api/admin/training/modules', { query: { pageSize: MAX_PAGE_SIZE } })
      : Promise.resolve({ items: [] as ModuleCandidate[] })),
    { default: () => ({ items: [] as ModuleCandidate[] }) },
  ),
])

// A failed read is not an estate with nothing set up, so it never renders as one (K-127).
const failure = useListFailure(error, 'What a show night needs could not be read.')

const moduleOptions = computed(() => modules.value.items.map(one => ({ label: `${one.id} ${one.name}`, value: one.id })))
const saving = ref<ShiftRole | null>(null)

async function saveEligibility(role: ShiftRole, next: string | null): Promise<void> {
  saving.value = role
  try {
    await $fetch(`/api/admin/config/${ELIGIBILITY_KEYS[role]}`, { method: 'PUT', body: { value: next } })
    toast.add({ title: 'Shift eligibility saved', icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (caught) {
    toast.add({ title: refusalText(caught), color: 'error' })
  }
  finally {
    saving.value = null
  }
}

const saysSlots = (venue: VenueReadiness): string => (venue.templateSlots === 0
  ? 'No template, so its performances show as unstaffed.'
  : `${plural(venue.templateSlots, 'shift')} on every performance.`)

const saysCard = (venue: VenueReadiness): string =>
  (venue.emergencyFiled ? 'Its emergency card is filed.' : 'No emergency card with an address filed yet.')

const saysBoard = computed(() => `${plural(data.value.board.presets, 'preset call')} and ${plural(data.value.board.milestones, 'milestone')} on the backstage board.`)
</script>

<template>
  <UPageCard
    title="Ready for a show night"
    description="What each role needs, and what each venue we run still lacks, before a volunteer can take a shift there."
    data-test="rota-readiness"
  >
    <ReadFailure
      v-if="failure"
      :failure="failure"
      @retry="refresh()"
    />

    <template v-else>
      <section data-test="shift-eligibility">
        <h3 class="text-sm font-semibold">
          Who can claim each role
        </h3>
        <ul class="mt-2 divide-y divide-default">
          <li
            v-for="line in data.eligibility"
            :key="line.role"
            class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
          >
            <UBadge
              :color="line.standing === 'SET' ? 'success' : 'warning'"
              variant="subtle"
              size="sm"
            >
              {{ line.standing === 'SET' ? 'Open' : 'Closed' }}
            </UBadge>
            <span class="font-medium">{{ saysShiftRole(line.role) }}</span>
            <span
              class="min-w-0 flex-1 text-sm text-muted"
              :data-test="`readiness-eligibility-${line.role}`"
            >
              {{ saysEligibility(line) }}
            </span>
            <USelectMenu
              v-if="edits"
              :model-value="line.moduleId ?? undefined"
              :items="moduleOptions"
              value-key="value"
              clearable
              :loading="saving === line.role"
              :disabled="moduleOptions.length === 0"
              placeholder="No module set"
              class="w-full sm:w-72"
              :aria-label="`Module for a ${saysShiftRole(line.role).toLowerCase()} shift`"
              :data-test="`eligibility-${line.role}`"
              @update:model-value="value => saveEligibility(line.role, (value as string | undefined) ?? null)"
            />
          </li>
        </ul>
      </section>

      <section
        class="mt-6"
        data-test="readiness-venues"
      >
        <h3 class="text-sm font-semibold">
          Each venue we run
        </h3>
        <p
          v-if="data.venues.length === 0"
          class="mt-2 text-sm text-muted"
        >
          No venue of our own yet. Add one on Venues first.
        </p>
        <ul
          v-else
          class="mt-2 divide-y divide-default"
        >
          <li
            v-for="venue in data.venues"
            :key="venue.venueId"
            class="space-y-1 py-2 text-sm"
            :data-test="`readiness-venue-${venue.venueId}`"
          >
            <p class="flex flex-wrap items-center gap-2 font-medium">
              {{ venue.venueName }}
              <UBadge
                :color="venueReady(venue) ? 'success' : 'warning'"
                variant="subtle"
                size="sm"
              >
                {{ venueReady(venue) ? 'Ready' : 'Not ready' }}
              </UBadge>
            </p>
            <p class="text-muted">
              {{ saysSlots(venue) }}
            </p>
            <p class="text-muted">
              <ULink
                v-if="fixes.checklists"
                :to="fixes.checklists"
              >
                {{ saysChecklistReadiness(venue.systemChecks) }}
              </ULink>
              <template v-else>
                {{ saysChecklistReadiness(venue.systemChecks) }}
              </template>
            </p>
            <p class="text-muted">
              <ULink
                v-if="fixes.cards"
                :to="fixes.cards"
              >
                {{ saysCard(venue) }}
              </ULink>
              <template v-else>
                {{ saysCard(venue) }}
              </template>
            </p>
          </li>
        </ul>
      </section>

      <p
        class="mt-6 text-sm text-muted"
        data-test="readiness-board"
      >
        <ULink
          v-if="fixes.board"
          :to="fixes.board"
        >
          {{ saysBoard }}
        </ULink>
        <template v-else>
          {{ saysBoard }}
        </template>
      </p>
    </template>
  </UPageCard>
</template>
