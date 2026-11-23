<!-- Seating layouts (show walkthrough, decisions 6 and 10): each space's ways of being set out, with
     how many seats each holds, how many wheelchair spaces it has and how many seats each space takes
     the place of. One is the space's usual layout, which a show there uses unless someone chooses
     another on its performance's set-up. Reached beside Venues from the programme's settings. -->
<script setup lang="ts">
import type { z } from 'zod'
import { layoutInput } from '../../../../../server/input'

interface Layout { id: string, spaceId: string, name: string, seats: number | null, wheelchairSpaces: number, seatsPerSpace: number, seatsSection: string | null, usual: boolean }
interface Listing { rows: Layout[], spaces: { id: string, name: string, capacity: number | null }[] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const { confirm } = useConfirm()
const { offer } = useUndo()
const { data, status, error, refresh } = await useAPI<Listing>('/api/box-office/seating-layouts', { key: 'box-office:seating-layouts' })

// The spaces that have layouts, each with its own, usual first.
const groups = computed(() => (data.value?.spaces ?? [])
  .map(space => ({ space, layouts: (data.value?.rows ?? []).filter(l => l.spaceId === space.id) }))
  .filter(g => g.layouts.length))

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
async function run<T>(fn: () => Promise<T>, done: string, undo?: (result: T) => Promise<unknown>, onRefusal = refusal) {
  onRefusal.value = null
  try {
    const result = await fn()
    await refresh()
    offer(done, undo && (async () => {
      await undo(result)
      await refresh()
    }))
    return true
  }
  catch (e) {
    onRefusal.value = toRefusal(e)
    return false
  }
}

// "100 seats · 2 wheelchair spaces, each in place of 2 seats"
function describe(l: Layout) {
  const space = data.value?.spaces.find(s => s.id === l.spaceId)
  const seats = l.seats ?? space?.capacity ?? null
  const parts = [seats === null ? t('box-office.layouts.seats-of-space') : t('box-office.layouts.seats', { count: seats })]
  if (!l.wheelchairSpaces) parts.push(t('box-office.layouts.no-spaces'))
  else if (!l.seatsPerSpace) parts.push(t('box-office.layouts.spaces-apart', { spaces: t('box-office.layouts.spaces', { count: l.wheelchairSpaces }) }))
  else {
    const taking = t('box-office.layouts.spaces-taking', { spaces: t('box-office.layouts.spaces', { count: l.wheelchairSpaces }), seats: t('box-office.layouts.seats', { count: l.seatsPerSpace }) })
    parts.push(l.seatsSection ? t('box-office.layouts.from-section', { what: taking, section: l.seatsSection }) : taking)
  }
  return parts.join(' · ')
}

type Form = z.input<typeof layoutInput>
const editing = ref(false)
const editId = ref<string | null>(null)
const formRefusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = reactive<Form>({ spaceId: '', name: '', seats: null, wheelchairSpaces: 2, seatsPerSpace: 2, seatsSection: null })
const spaceItems = computed(() => (data.value?.spaces ?? []).map(s => ({ value: s.id, label: s.name })))

function open(l?: Layout) {
  editId.value = l?.id ?? null
  Object.assign(form, l
    ? { spaceId: l.spaceId, name: l.name, seats: l.seats, wheelchairSpaces: l.wheelchairSpaces, seatsPerSpace: l.seatsPerSpace, seatsSection: l.seatsSection }
    : { spaceId: spaceItems.value.length === 1 ? spaceItems.value[0]!.value : '', name: '', seats: null, wheelchairSpaces: 2, seatsPerSpace: 2, seatsSection: null })
  formRefusal.value = null
  editing.value = true
}
const url = (id: string) => `/api/box-office/seating-layouts/${encodeURIComponent(id)}`
const bodyOf = (l: Layout | Form) => ({ spaceId: l.spaceId, name: l.name.trim(), seats: l.seats ?? null, wheelchairSpaces: l.wheelchairSpaces, seatsPerSpace: l.seatsPerSpace, seatsSection: l.seatsSection?.trim() || null })
async function save() {
  const body = bodyOf(form)
  const id = editId.value
  const before = id ? data.value?.rows.find(l => l.id === id) : undefined
  const ok = id && before
    ? await run(() => $api(url(id), { method: 'PUT', body }), t('box-office.layouts.saved', { name: body.name }), () => $api(url(id), { method: 'PUT', body: bodyOf(before) }), formRefusal)
    : await run(() => $api<{ id: string }>('/api/box-office/seating-layouts', { method: 'POST', body }), t('box-office.layouts.added', { name: body.name }), made => $api(url(made.id), { method: 'DELETE', body: {} }), formRefusal)
  if (ok) editing.value = false
}
async function remove(l: Layout) {
  if (!await confirm({ verb: t('box-office.layouts.delete.verb'), thing: l.name, consequence: t('box-office.layouts.delete.consequence') })) return
  await run(() => $api(url(l.id), { method: 'DELETE', body: {} }), t('box-office.layouts.deleted', { name: l.name }), async () => {
    const made = await $api<{ id: string }>('/api/box-office/seating-layouts', { method: 'POST', body: bodyOf(l) })
    if (l.usual) await $api(`${url(made.id)}/usual`, { method: 'POST', body: {} })
  })
}
async function makeUsual(l: Layout) {
  const before = data.value?.rows.find(r => r.spaceId === l.spaceId && r.usual)
  await run(() => $api(`${url(l.id)}/usual`, { method: 'POST', body: {} }), t('box-office.layouts.made-usual', { name: l.name }), before ? () => $api(`${url(before.id)}/usual`, { method: 'POST', body: {} }) : undefined)
}
const actions = (l: Layout) => [[
  { label: t('box-office.layouts.edit'), icon: 'i-lucide-pencil', onSelect: () => open(l) },
  ...(l.usual ? [] : [{ label: t('box-office.layouts.make-usual'), icon: 'i-lucide-star', onSelect: () => makeUsual(l) }]),
  { label: t('box-office.layouts.delete.verb'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(l) },
]]
</script>

<template>
  <PageFrame
    :title="t('box-office.navigation.seating-layouts.label')"
    :description="t('box-office.layouts.description')"
    width="reading"
  >
    <template #primary>
      <UButton
        :label="t('box-office.layouts.new')"
        icon="i-lucide-plus"
        :disabled="!spaceItems.length"
        @click="open()"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <template #default>
        <div class="space-y-4">
          <RefusalNotice
            v-if="!editing"
            :refusal="refusal"
          />
          <EmptyState
            v-if="!groups.length"
            :title="t('box-office.layouts.empty.title')"
            :description="spaceItems.length ? t('box-office.layouts.empty.description') : t('box-office.layouts.empty.no-spaces')"
            icon="i-lucide-armchair"
          />
          <PageSection
            v-for="g in groups"
            :key="g.space.id"
            :title="g.space.name"
          >
            <RecordList :label="t('box-office.layouts.of-space', { space: g.space.name })">
              <RecordListItem
                v-for="l in g.layouts"
                :key="l.id"
                :name="l.name"
                :description="describe(l)"
              >
                <UBadge
                  v-if="l.usual"
                  :label="t('box-office.layouts.usual')"
                  color="neutral"
                  variant="subtle"
                />
                <RowActions
                  :items="actions(l)"
                  :label="t('box-office.layouts.actions', { name: l.name })"
                />
              </RecordListItem>
            </RecordList>
          </PageSection>
          <p class="text-sm text-muted">
            {{ t('box-office.layouts.keep-back') }}
            <ULink
              to="/admin/modules/box-office?setting=box-office.wheelchair.keep-seats-before"
              class="text-primary"
            >
              {{ t('box-office.layouts.keep-back-link') }}
            </ULink>
          </p>
        </div>
      </template>
    </DataBoundary>

    <UModal
      v-model:open="editing"
      :title="editId ? t('box-office.layouts.edit-title') : t('box-office.layouts.new')"
    >
      <template #body>
        <UForm
          id="seating-layout-form"
          :schema="layoutInput"
          :state="form"
          class="space-y-4"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="formRefusal" />
          <UFormField
            :label="t('box-office.layouts.space')"
            name="spaceId"
            required
          >
            <USelect
              v-model="form.spaceId"
              :items="spaceItems"
              :disabled="!!editId"
              :placeholder="t('box-office.layouts.space-placeholder')"
            />
          </UFormField>
          <UFormField
            :label="t('box-office.layouts.name')"
            name="name"
            :help="t('box-office.layouts.name-help')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            :label="t('box-office.layouts.seats-label')"
            name="seats"
            :help="t('box-office.layouts.seats-help')"
          >
            <FieldNumber
              :model-value="form.seats ?? undefined"
              :min="0"
              @update:model-value="form.seats = $event ?? null"
            />
          </UFormField>
          <UFormField
            :label="t('box-office.layouts.spaces-label')"
            name="wheelchairSpaces"
            required
          >
            <FieldNumber
              v-model="form.wheelchairSpaces"
              :min="0"
              :max="500"
            />
          </UFormField>
          <UFormField
            v-if="form.wheelchairSpaces"
            :label="t('box-office.layouts.each-label')"
            name="seatsPerSpace"
            :help="t('box-office.layouts.each-help')"
            required
          >
            <FieldNumber
              v-model="form.seatsPerSpace"
              :min="0"
              :max="20"
            />
          </UFormField>
          <UFormField
            v-if="form.wheelchairSpaces && form.seatsPerSpace"
            :label="t('box-office.layouts.section-label')"
            name="seatsSection"
            :help="t('box-office.layouts.section-help')"
          >
            <UInput
              :model-value="form.seatsSection ?? ''"
              maxlength="80"
              @update:model-value="form.seatsSection = String($event) || null"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="seating-layout-form"
          :label="editId ? t('box-office.layouts.save') : t('box-office.layouts.add')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
