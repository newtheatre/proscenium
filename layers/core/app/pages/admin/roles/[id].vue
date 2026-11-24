<!-- One role (ID-22; identity spec part 6): its name, description, when grants of it end, whether
     it opens the members' area, and the abilities it brings, grouped by module. `new` makes one,
     optionally starting from one of the usual jobs in a theatre. The Owner role brings everything
     and cannot be changed. Who holds it is in the console. A failed save takes the person to the
     first problem; the buttons stay in view at the foot of the page. -->
<script setup lang="ts">
import type { FormErrorEvent } from '@nuxt/ui'
import { roleInput } from '../../../../server/identity/inputs'
import { ROLE_TEMPLATES } from '../../../../shared/role-templates'
import type { CatalogueAbility } from '../../../components/AbilityPicker.vue'

interface Role { id: string, key: string, name: string, description: string | null, fixed: boolean, opensMembersArea: boolean, expiryRule: 'year_end' | 'days' | 'none', expiryDays: number | null, archived: boolean, holders: number, abilities: string[] }
interface Roles { roles: Role[], catalogue: CatalogueAbility[], yearEndSet?: boolean, allowNoExpiry?: boolean, newRoleEnds?: Role['expiryRule'] }

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { confirm } = useConfirm()
const toast = useToast()
const route = useRoute()
const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'new')
const { data, status, error, refresh } = await useAPI<Roles>('/api/core/roles', { key: 'core:roles' })
const role = computed(() => data.value?.roles.find(r => r.id === id.value))
const readOnly = computed(() => !!role.value?.fixed || !!role.value?.archived)

const A_YEAR = 365 // not-policy: a starting value for "after a number of days", changed in the field
const newEnds = () => data.value?.newRoleEnds ?? 'none'
const form = reactive({ name: '', description: '', expiryRule: newEnds(), expiryDays: newEnds() === 'days' ? A_YEAR : null as number | null, opensMembersArea: true, abilities: [] as string[] })
watch(role, (r) => {
  if (!r) return
  Object.assign(form, { name: r.name, description: r.description ?? '', expiryRule: r.expiryRule, expiryDays: r.expiryDays, opensMembersArea: r.opensMembersArea, abilities: [...r.abilities] })
}, { immediate: true })

// A role cannot end at a year end the theatre has not set, nor never when roles must end; an
// existing role keeps showing the choice it has.
const expiryOptions = computed(() => [
  { value: 'year_end', label: t('core.roles.ends.year-end'), disabled: data.value?.yearEndSet === false && form.expiryRule !== 'year_end' },
  { value: 'days', label: t('core.roles.ends.after-days') },
  { value: 'none', label: t('core.roles.ends.none'), disabled: data.value?.allowNoExpiry === false && form.expiryRule !== 'none' },
])
// Why a choice cannot be made goes under the field, not on the dimmed choice, so it stays legible.
const expiryHelp = computed(() => [
  t('core.roles.ends.help'),
  data.value?.yearEndSet === false ? t('core.roles.ends.year-end-unset') : '',
  data.value?.allowNoExpiry === false ? t('core.roles.ends.none-not-allowed') : '',
].filter(Boolean).join(' '))
watch(() => form.expiryRule, (rule) => { if (rule === 'days' && !form.expiryDays) form.expiryDays = A_YEAR })

// Starting points for a new role. Choosing one fills the form with what the editor may give.
const template = ref<string>('blank')
const templateItems = computed(() => [
  { value: 'blank', label: t('core.roles.templates.blank') },
  ...ROLE_TEMPLATES.map(x => ({ value: x.id, label: t(`core.roles.templates.${x.id}.name`) })),
])
const leftOut = ref(0)
watch(template, (now, before) => {
  const chosen = ROLE_TEMPLATES.find(x => x.id === now)
  const previous = ROLE_TEMPLATES.find(x => x.id === before)
  const named = (x: typeof chosen) => x ? t(`core.roles.templates.${x.id}.name`) : ''
  const described = (x: typeof chosen) => x ? t(`core.roles.templates.${x.id}.description`) : ''
  // What the person typed themselves is kept; what the last template filled in is replaced.
  if (!form.name.trim() || form.name === named(previous)) form.name = named(chosen)
  if (!form.description.trim() || form.description === described(previous)) form.description = described(chosen)
  const catalogue = new Map((data.value?.catalogue ?? []).map(a => [a.name, a]))
  const usable = (chosen?.abilities ?? []).filter(a => catalogue.get(a)?.held && catalogue.get(a)?.moduleOn !== false)
  leftOut.value = (chosen?.abilities.filter(a => catalogue.has(a)).length ?? 0) - usable.length
  form.abilities = usable
})

const title = computed(() => isNew.value ? t('core.roles.new') : (role.value?.name ?? t('core.roles.role')))
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const saving = ref(false)
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const top = useTemplateRef<HTMLElement>('top')

/** Takes the person to the first problem: the field, or the refusal at the top of the form. */
// The first problem on the page, in reading order, not the order the schema lists its fields:
// by the field's id where the form gives one, otherwise by its name within this form.
function focusFirst(errors: { id?: string, name?: string }[]): boolean {
  const find = (e: { id?: string, name?: string }) => (e.id ? document.getElementById(e.id) : null)
    ?? (e.name ? document.querySelector<HTMLElement>(`#core-role [name="${CSS.escape(e.name)}"]`) : null)
  const fields = errors.map(find).filter((el): el is HTMLElement => !!el)
  fields.sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
  const field = fields[0]
  if (!field) return false
  field.scrollIntoView({ block: 'center', behavior: 'smooth' })
  field.focus({ preventScroll: true })
  return true
}
function onError(event: FormErrorEvent) {
  // The form holds its fields disabled while it checks them; move once it has let them go.
  setTimeout(() => focusFirst(event.errors))
}
/** A refusal about a field goes to the field; any other goes to the notice at the top. */
async function showRefusal(fields: { name: string }[] = []) {
  await nextTick()
  if (!focusFirst(fields)) top.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

async function save() {
  refusal.value = null
  saving.value = true
  const body = { ...form, description: form.description.trim() || null, expiryDays: form.expiryRule === 'days' ? form.expiryDays : null }
  try {
    if (isNew.value) {
      const made = await $api<{ id: string }>('/api/core/roles', { method: 'POST', body })
      toast.add({ title: t('core.roles.created', { name: form.name }), color: 'success' })
      await refresh()
      await navigateTo(`/admin/roles/${made.id}`, { replace: true })
    }
    else {
      await $api(`/api/core/roles/${id.value}` as '/api/core/roles/:id', { method: 'PUT', body })
      toast.add({ title: t('core.roles.saved'), color: 'success' })
      await refresh()
    }
  }
  catch (e) {
    refusal.value = toRefusal(e)
    const fields = fieldErrors(refusal.value)
    formEl.value?.setErrors(fields)
    await showRefusal(fields)
  }
  finally {
    saving.value = false
  }
}

async function archive() {
  if (!role.value) return
  const holders = role.value.holders
  if (!await confirm({ verb: t('core.roles.archive'), thing: role.value.name, consequence: holders ? t('core.roles.archive-ends', { count: holders }) : t('core.roles.archive-none'), button: t('core.roles.archive') })) return
  refusal.value = null
  try {
    await $api(`/api/core/roles/${id.value}/archive` as '/api/core/roles/:id/archive', { method: 'POST', body: {} })
    toast.add({ title: t('core.roles.archived-toast', { name: role.value.name }), color: 'success' })
    await refresh()
  }
  catch (e) {
    refusal.value = toRefusal(e)
    await showRefusal()
  }
}
</script>

<template>
  <PageFrame
    :title="title"
    :trail="[{ label: t('core.roles.title'), to: '/admin/roles' }]"
    width="reading"
  >
    <template #status>
      <StatusBadge
        v-if="role?.fixed"
        tone="neutral"
        :label="t('core.roles.fixed')"
      />
      <StatusBadge
        v-else-if="role?.archived"
        tone="neutral"
        :label="t('core.roles.archived')"
      />
    </template>
    <DataBoundary
      :data="data"
      :status="status"
      :error="error"
      @retry="refresh()"
    >
      <EmptyState
        v-if="!isNew && !role"
        icon="i-lucide-shield-question"
        :title="t('core.roles.missing')"
      />
      <UForm
        v-else
        id="core-role"
        ref="formEl"
        :schema="roleInput"
        :state="{ ...form, description: form.description.trim() || null, expiryDays: form.expiryRule === 'days' ? form.expiryDays : null }"
        :disabled="readOnly"
        class="space-y-6"
        novalidate
        @submit="save"
        @error="onError"
      >
        <div
          ref="top"
          class="scroll-mt-24"
        >
          <RefusalNotice :refusal="refusal" />
        </div>
        <UAlert
          v-if="role?.fixed"
          color="neutral"
          icon="i-lucide-lock"
          :title="t('core.roles.owner-fixed')"
        />

        <PageSection
          v-if="isNew"
          :title="t('core.roles.templates.title')"
          :description="t('core.roles.templates.description')"
        >
          <UFormField
            name="template"
            :label="t('core.roles.templates.label')"
            :help="leftOut ? t('core.roles.templates.left-out', { count: leftOut }) : undefined"
          >
            <USelect
              v-model="template"
              :items="templateItems"
            />
          </UFormField>
        </PageSection>

        <PageSection :title="t('core.roles.about')">
          <UFormField
            name="name"
            :label="t('core.roles.name')"
            required
          >
            <UInput
              v-model="form.name"
              maxlength="80"
            />
          </UFormField>
          <UFormField
            name="description"
            :label="t('core.roles.what-for')"
          >
            <UTextarea
              v-model="form.description"
              maxlength="500"
              :rows="2"
            />
          </UFormField>
          <UFormField
            name="expiryRule"
            :label="t('core.roles.ends.label')"
            :help="expiryHelp"
          >
            <USelect
              v-model="form.expiryRule"
              :items="expiryOptions"
              value-key="value"
              class="w-72"
            />
          </UFormField>
          <UFormField
            v-if="form.expiryRule === 'days'"
            name="expiryDays"
            :label="t('core.roles.ends.days-label')"
          >
            <FieldNumber
              v-model="form.expiryDays"
              :min="1"
              :max="3650"
            />
          </UFormField>
          <UFormField name="opensMembersArea">
            <UCheckbox
              v-model="form.opensMembersArea"
              :label="t('core.roles.opens-members')"
              :description="t('core.roles.opens-members-help')"
            />
          </UFormField>
        </PageSection>

        <PageSection
          :title="t('core.roles.abilities')"
          :description="t('core.roles.abilities-help')"
        >
          <AbilityPicker
            v-if="data"
            v-model="form.abilities"
            :catalogue="data.catalogue"
            :disabled="readOnly"
          />
        </PageSection>

        <PageSection
          v-if="role"
          :title="t('core.roles.who')"
        >
          <p class="text-sm">
            {{ t('core.roles.holders', { count: role.holders }) }}
          </p>
          <UButton
            variant="link"
            color="neutral"
            trailing-icon="i-lucide-arrow-right"
            :label="t('core.roles.who-link')"
            :to="`/console/people/grants?role=${role.id}`"
          />
        </PageSection>
      </UForm>
    </DataBoundary>
    <template
      v-if="!readOnly && (isNew || role)"
      #footer
    >
      <UButton
        v-if="role"
        color="error"
        variant="outline"
        :label="t('core.roles.archive')"
        loading-auto
        @click="archive"
      />
      <UButton
        type="submit"
        form="core-role"
        :loading="saving"
        :label="isNew ? t('core.roles.create') : t('core.roles.save')"
      />
    </template>
  </PageFrame>
</template>
