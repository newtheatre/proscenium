<!-- Rota templates (Front of house specification, part 5, "Console"): the duties and places a
     performance usually needs, by venue, so a whole season's rota can be set in one go. One template
     per venue may be the default. -->
<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface Line {
  dutyId: string
  places: number
}
interface Template {
  id: string
  name: string
  venueId: string | null
  isDefault: boolean
  archivedAt: number | null
  lines: Line[]
}
interface Choices {
  venues: { id: string, name: string }[]
  duties: { id: string, name: string }[]
}

const { t } = useT()
const write = useAct()
const { toRefusal } = useRefusal()
const undo = useUndo()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ templates: Template[], archived?: Template[] }>('/api/front-of-house/rota-templates', { key: 'front-of-house:rota-templates' })
const { data: choices } = await useAPI<Choices>('/api/front-of-house/choices', { key: 'front-of-house:choices' })

const ANY = 'any'
const venueItems = computed(() => [{ value: ANY, label: t('front-of-house.any-venue') }, ...(choices.value?.venues ?? []).map(v => ({ value: v.id, label: v.name }))])
const dutyItems = computed(() => (choices.value?.duties ?? []).map(d => ({ value: d.id, label: d.name })))
const venueName = (id: string | null) => id ? choices.value?.venues.find(v => v.id === id)?.name ?? '' : t('front-of-house.any-venue')
const dutyName = (id: string) => choices.value?.duties.find(d => d.id === id)?.name ?? ''

const blank = () => ({ name: '', venueId: ANY, isDefault: false, lines: [] as Line[] })
const form = ref(blank())
const editing = ref<Template | null>(null)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const open = ref(false)

function edit(template: Template) {
  editing.value = template
  form.value = { name: template.name, venueId: template.venueId ?? ANY, isDefault: template.isDefault, lines: template.lines.map(l => ({ ...l })) }
  refusal.value = null
  open.value = true
}
function add() {
  editing.value = null
  form.value = blank()
  refusal.value = null
  open.value = true
}
function addLine() {
  const free = dutyItems.value.find(d => !form.value.lines.some(l => l.dutyId === d.value))
  if (free) form.value.lines.push({ dutyId: free.value, places: 1 })
}

async function save() {
  refusal.value = null
  const body = { name: form.value.name.trim(), venueId: form.value.venueId === ANY ? null : form.value.venueId, isDefault: form.value.isDefault, lines: form.value.lines }
  try {
    if (editing.value) await write(`/api/front-of-house/rota-templates/${encodeURIComponent(editing.value.id)}`, { method: 'PUT', body })
    else await write('/api/front-of-house/rota-templates', { method: 'POST', body })
    toast.add({ title: t(editing.value ? 'front-of-house.templates.saved' : 'front-of-house.templates.added', { name: body.name }), color: 'success' })
    open.value = false
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

// Archiving asks nothing first: it is undone from its own toast, or later from the archived list.
async function setArchived(template: Template, archived: boolean) {
  refusal.value = null
  const call = (to: boolean) => write(`/api/front-of-house/rota-templates/${encodeURIComponent(template.id)}/${to ? 'archive' : 'restore'}`, { method: 'POST', body: {} })
  try {
    await call(archived)
    undo.offer(t(archived ? 'front-of-house.templates.archived' : 'front-of-house.templates.restored', { name: template.name }), async () => {
      await call(!archived)
      await refresh()
    })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}
const showArchived = ref(false)

const actions = (template: Template): DropdownMenuItem[][] => [
  [{ label: t('front-of-house.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(template) }],
  [{ label: t('front-of-house.archive.button'), icon: 'i-lucide-archive', color: 'error', onSelect: () => { void setArchived(template, true) } }],
]
const describe = (template: Template) => [
  venueName(template.venueId),
  template.isDefault ? t('front-of-house.templates.default') : null,
  template.lines.map(l => t('front-of-house.templates.line', { duty: dutyName(l.dutyId), count: l.places })).join(', '),
].filter(Boolean).join(' · ')
</script>

<template>
  <PageFrame
    :title="t('front-of-house.navigation.rota-templates.label')"
    :description="t('front-of-house.templates.description')"
  >
    <template #primary>
      <UButton
        icon="i-lucide-plus"
        :label="t('front-of-house.templates.add-button')"
        @click="add"
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
              v-if="!d.templates.length"
              :title="t('front-of-house.templates.empty.title')"
              :description="t('front-of-house.templates.empty.description')"
              icon="i-lucide-layout-list"
            />
            <RecordList
              v-else
              :label="t('front-of-house.navigation.rota-templates.label')"
            >
              <RecordListItem
                v-for="template in d.templates"
                :key="template.id"
                :name="template.name"
                :description="describe(template)"
              >
                <RowActions
                  :items="actions(template)"
                  :label="t('front-of-house.actions-for', { name: template.name })"
                />
              </RecordListItem>
            </RecordList>
            <CollapsibleDivider
              v-model:open="showArchived"
              :label="t('front-of-house.archived.label')"
              :count="d.archived?.length ?? 0"
            >
              <RecordList :label="t('front-of-house.templates.archived-list')">
                <RecordListItem
                  v-for="template in d.archived"
                  :key="template.id"
                  :name="template.name"
                  :description="describe(template)"
                  muted
                >
                  <UButton
                    color="neutral"
                    variant="outline"
                    size="sm"
                    icon="i-lucide-archive-restore"
                    :label="t('front-of-house.restore.button')"
                    :aria-label="t('front-of-house.restore.named', { name: template.name })"
                    loading-auto
                    @click="setArchived(template, false)"
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
      :title="editing ? t('front-of-house.templates.edit-title', { name: editing.name }) : t('front-of-house.templates.add-title')"
    >
      <template #body>
        <UForm
          id="fh-template"
          class="space-y-4"
          :state="form"
          :validate="() => needs({ name: form.name })"
          novalidate
          @submit="save"
        >
          <RefusalNotice :refusal="refusal" />
          <UFormField
            name="name"
            :label="t('front-of-house.templates.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <UFormField :label="t('front-of-house.venue')">
            <USelectMenu
              v-model="form.venueId"
              :items="venueItems"
              value-key="value"
            />
          </UFormField>
          <UCheckbox
            v-model="form.isDefault"
            :label="t('front-of-house.templates.is-default')"
            :description="t('front-of-house.templates.is-default-help')"
          />
          <fieldset class="space-y-3">
            <legend class="text-sm font-medium">
              {{ t('front-of-house.templates.lines') }}
            </legend>
            <div
              v-for="(line, i) in form.lines"
              :key="i"
              class="flex items-end gap-2"
            >
              <UFormField
                :label="t('front-of-house.templates.duty')"
                class="flex-1"
              >
                <USelectMenu
                  v-model="line.dutyId"
                  :items="dutyItems"
                  value-key="value"
                />
              </UFormField>
              <UFormField :label="t('front-of-house.templates.places')">
                <FieldNumber
                  v-model="line.places"
                  :min="1"
                  :max="50"
                />
              </UFormField>
              <IconButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                :label="t('front-of-house.templates.remove-line', { duty: dutyName(line.dutyId) })"
                @click="form.lines.splice(i, 1)"
              />
            </div>
            <UButton
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              :label="t('front-of-house.templates.add-line')"
              :disabled="form.lines.length >= dutyItems.length"
              @click="addLine"
            />
          </fieldset>
        </UForm>
      </template>
      <template #footer>
        <UButton
          type="submit"
          form="fh-template"
          :label="editing ? t('front-of-house.save') : t('front-of-house.templates.add-button')"
        />
      </template>
    </UModal>
  </PageFrame>
</template>
