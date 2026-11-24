<!-- Rooms and resources (spec part 5): core's spaces by venue, each bookable or not, and the
     theatre's resources. A space is edited in the programme; here it is only made bookable, as an
     external room when the theatre does not run it (SP-05, SP-10, SP-11). -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface SpaceRow { id: string, name: string, managed: boolean, capacity: number | null, bookableId: string | null, state: string | null }
interface Bookable { id: string, kind: 'space' | 'resource', name: string, venueName: string | null, control: 'own' | 'external', state: 'active' | 'paused' | 'archived' }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const toast = useToast()
const undo = useUndo()
const { data, status, error, refresh } = await useAPI<{ venues: { id: string, name: string, spaces: SpaceRow[] }[], bookables: Bookable[] }>('/api/spaces/bookables', { key: 'spaces:bookables' })

const resources = computed(() => (data.value?.bookables ?? []).filter(b => b.kind === 'resource' && b.state !== 'archived'))
const archived = computed(() => (data.value?.bookables ?? []).filter(b => b.state === 'archived'))
const showArchived = ref(false)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)

const describeSpace = (s: SpaceRow) => [
  s.state ? t(`spaces.bookables.state.${s.state}`) : t('spaces.bookables.not-bookable'),
  s.managed ? null : t('spaces.bookables.external'),
  s.capacity ? t('spaces.bookables.capacity', { count: s.capacity }) : null,
].filter(Boolean).join(' · ')
const describeResource = (b: Bookable) => [t(`spaces.bookables.state.${b.state}`), b.venueName, b.control === 'external' ? t('spaces.bookables.external') : null].filter(Boolean).join(' · ')

// One form adds a resource or makes an unmanaged space an external room; both ask who to contact.
const open = ref(false)
const making = ref<SpaceRow | null>(null)
const blank = () => ({ name: '', homeVenueId: null as string | null, control: 'own' as 'own' | 'external', externalContact: '', approvalNote: '' })
const form = ref(blank())
// A select cannot hold null, so having none is an item of its own.
const NONE = 'none'
const venueItems = computed(() => [{ value: NONE, label: t('spaces.bookables.no-home-venue') }, ...(data.value?.venues ?? []).map(v => ({ value: v.id, label: v.name }))])
const controlItems = computed(() => [{ value: 'own', label: t('spaces.bookables.control.own') }, { value: 'external', label: t('spaces.bookables.control.external') }])
const external = computed(() => making.value ? true : form.value.control === 'external')

function addResource() {
  making.value = null
  form.value = blank()
  refusal.value = null
  open.value = true
}

async function makeBookable(space: SpaceRow) {
  refusal.value = null
  if (!space.managed) {
    making.value = space
    form.value = { ...blank(), control: 'external' }
    open.value = true
    return
  }
  try {
    const made = await $api<{ bookableId: string }>('/api/spaces/bookables', { method: 'POST', body: { spaceId: space.id } })
    toast.add({ title: t('spaces.bookables.made', { name: space.name }), color: 'success', actions: [{ label: t('spaces.bookables.open'), to: `/admin/modules/spaces/bookables/${made.bookableId}` }] })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function save() {
  refusal.value = null
  const note = { externalContact: external.value ? form.value.externalContact.trim() || null : null, approvalNote: form.value.approvalNote.trim() || null }
  const body = making.value
    ? { spaceId: making.value.id, ...note }
    : { name: form.value.name.trim(), homeVenueId: form.value.homeVenueId, control: form.value.control, ...note }
  try {
    const made = await $api<{ bookableId: string }>('/api/spaces/bookables', { method: 'POST', body })
    open.value = false
    await navigateTo(`/admin/modules/spaces/bookables/${made.bookableId}`)
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function restore(b: Bookable) {
  refusal.value = null
  try {
    await $api(`/api/spaces/bookables/${b.id}/state`, { method: 'POST', body: { to: 'active' } })
    undo.offer(t('spaces.bookables.restored', { name: b.name }), async () => {
      await $api(`/api/spaces/bookables/${b.id}/state`, { method: 'POST', body: { to: 'archived' } })
      await refresh()
    })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const spaceActions = (s: SpaceRow): DropdownMenuItem[][] => s.bookableId
  ? [[{ label: t('spaces.bookables.open'), icon: 'i-lucide-pencil', to: `/admin/modules/spaces/bookables/${s.bookableId}` }]]
  : [[{ label: s.managed ? t('spaces.bookables.make') : t('spaces.bookables.make-external'), icon: 'i-lucide-plus', onSelect: () => { void makeBookable(s) } }]]
const resourceForm = useFormRef('resourceForm')
</script>

<template>
  <PageFrame
    :title="t('spaces.navigation.bookables.label')"
    :description="t('spaces.bookables.description')"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('spaces.bookables.add-resource')"
        @click="addResource"
      />
    </template>
    <div class="space-y-4">
      <RefusalNotice
        v-if="!open"
        :refusal="refusal"
      />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
          <div class="space-y-4">
            <EmptyState
              v-if="!d.venues.length && !resources.length"
              :title="t('spaces.bookables.empty.title')"
              :description="t('spaces.bookables.empty.description')"
              icon="i-lucide-door-open"
            />
            <PageSection
              v-for="venue in d.venues"
              :key="venue.id"
              :title="venue.name"
            >
              <RecordList :label="t('spaces.bookables.spaces-in', { venue: venue.name })">
                <RecordListItem
                  v-for="space in venue.spaces"
                  :key="space.id"
                  :name="space.name"
                  :description="describeSpace(space)"
                  :to="space.bookableId && space.state !== 'archived' ? `/admin/modules/spaces/bookables/${space.bookableId}` : undefined"
                  :muted="!space.bookableId || space.state === 'archived'"
                >
                  <template #trailing>
                    <UButton
                      v-if="!space.bookableId"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      icon="i-lucide-plus"
                      :label="space.managed ? t('spaces.bookables.make') : t('spaces.bookables.make-external')"
                      :aria-label="t(space.managed ? 'spaces.bookables.make-named' : 'spaces.bookables.make-external-named', { name: space.name })"
                      loading-auto
                      @click="makeBookable(space)"
                    />
                    <RowActions
                      v-else
                      :items="spaceActions(space)"
                      :label="t('spaces.bookables.actions-for', { name: space.name })"
                    />
                  </template>
                </RecordListItem>
              </RecordList>
            </PageSection>
            <PageSection
              :title="t('spaces.bookables.resources')"
              :description="t('spaces.bookables.resources-help')"
            >
              <RecordList
                v-if="resources.length"
                :label="t('spaces.bookables.resources')"
              >
                <RecordListItem
                  v-for="b in resources"
                  :key="b.id"
                  :name="b.name"
                  :description="describeResource(b)"
                  :to="`/admin/modules/spaces/bookables/${b.id}`"
                />
              </RecordList>
              <p
                v-else
                class="text-sm text-muted"
              >
                {{ t('spaces.bookables.no-resources') }}
              </p>
            </PageSection>
            <CollapsibleDivider
              v-model:open="showArchived"
              :label="t('spaces.bookables.archived')"
              :count="archived.length"
            >
              <RecordList :label="t('spaces.bookables.archived')">
                <RecordListItem
                  v-for="b in archived"
                  :key="b.id"
                  :name="b.name"
                  :description="b.venueName ?? undefined"
                  muted
                >
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-archive-restore"
                    :label="t('spaces.bookables.restore')"
                    :aria-label="t('spaces.bookables.restore-named', { name: b.name })"
                    loading-auto
                    @click="restore(b)"
                  />
                </RecordListItem>
              </RecordList>
            </CollapsibleDivider>
          </div>
        </template>
      </DataBoundary>
    </div>

    <UModal
      v-model:open="open"
      :title="making ? t('spaces.bookables.make-external-title', { name: making.name }) : t('spaces.bookables.add-resource')"
    >
      <template #body>
        <UForm
          id="spaces-new-bookable"
          ref="resourceForm"
          class="space-y-4"
          :state="form"
          :validate="() => making ? [] : needs({ name: form.name })"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <template v-if="!making">
            <UFormField
              name="name"
              :label="t('spaces.bookables.name')"
              :help="t('spaces.bookables.name-help')"
              required
            >
              <UInput
                v-model="form.name"
                maxlength="80"
              />
            </UFormField>
            <UFormField
              :label="t('spaces.bookables.home-venue')"
              :help="t('spaces.bookables.home-venue-help')"
            >
              <USelect
                :model-value="form.homeVenueId ?? NONE"
                :items="venueItems"
                @update:model-value="form.homeVenueId = $event === NONE ? null : $event as string"
              />
            </UFormField>
            <UFormField :label="t('spaces.bookables.control.label')">
              <USelect
                v-model="form.control"
                :items="controlItems"
              />
            </UFormField>
          </template>
          <UFormField
            v-if="external"
            :label="t('spaces.bookables.contact')"
            :help="t('spaces.bookables.contact-help')"
          >
            <UInput
              v-model="form.externalContact"
              maxlength="200"
            />
          </UFormField>
          <UFormField
            :label="t('spaces.bookables.approval-note')"
            :help="t('spaces.bookables.approval-note-help')"
          >
            <UTextarea
              v-model="form.approvalNote"
              maxlength="500"
              :rows="2"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="spaces-new-bookable"
          :loading="resourceForm?.loading"
          :label="making ? t('spaces.bookables.make-external') : t('spaces.bookables.add-resource')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
