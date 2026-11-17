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
const { confirm } = useConfirm()
const toast = useToast()
const { data, status, error, refresh } = await useAPI<{ templates: Template[] }>('/api/front-of-house/rota-templates', { key: 'front-of-house:rota-templates' })
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

function edit(template: Template) {
  editing.value = template
  form.value = { name: template.name, venueId: template.venueId ?? ANY, isDefault: template.isDefault, lines: template.lines.map(l => ({ ...l })) }
}
function stop() {
  editing.value = null
  form.value = blank()
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
    stop()
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

async function archive(template: Template) {
  if (!await confirm({ verb: t('front-of-house.archive.verb'), thing: t('front-of-house.templates.thing', { name: template.name }), consequence: t('front-of-house.templates.archive-consequence'), button: t('front-of-house.archive.button') })) return
  refusal.value = null
  try {
    await write(`/api/front-of-house/rota-templates/${encodeURIComponent(template.id)}/archive`, { method: 'POST', body: {} })
    toast.add({ title: t('front-of-house.templates.archived', { name: template.name }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
  }
}

const actions = (template: Template): DropdownMenuItem[][] => [
  [{ label: t('front-of-house.edit'), icon: 'i-lucide-pencil', onSelect: () => edit(template) }],
  [{ label: t('front-of-house.archive.button'), icon: 'i-lucide-archive', color: 'error', onSelect: () => { void archive(template) } }],
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
    <div class="space-y-8">
      <RefusalNotice :refusal="refusal" />
      <DataBoundary
        :data="data"
        :status="status"
        :error="error"
        @retry="refresh()"
      >
        <template #default="{ data: d }">
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
        </template>
      </DataBoundary>

      <PageSection :title="editing ? t('front-of-house.templates.edit-title', { name: editing.name }) : t('front-of-house.templates.add-title')">
        <UForm
          class="space-y-4"
          :state="form"
          :validate="() => needs({ name: form.name })"
          novalidate
          @submit="save"
        >
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
                <UInputNumber
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
          <div class="flex gap-2">
            <UButton
              type="submit"
              :label="editing ? t('front-of-house.save') : t('front-of-house.templates.add-button')"
            />
            <UButton
              v-if="editing"
              color="neutral"
              variant="ghost"
              :label="t('front-of-house.cancel')"
              @click="stop"
            />
          </div>
        </UForm>
      </PageSection>
    </div>
  </PageFrame>
</template>
