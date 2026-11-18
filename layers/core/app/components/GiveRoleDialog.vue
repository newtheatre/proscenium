<!-- Give a role (ID-23): to a person chosen with the picker, or to the one person a page is about.
     The role's reach is asked only when the role can be given for one module, and its end follows
     the role's own rule unless the giver picks a date. The grant can be undone from the toast.
     Opened from Who holds what and from a person's page; the server checks every grant. -->
<script setup lang="ts">
import { parseDate } from '@internationalized/date'

export interface GrantRoleOption { id: string, name: string, owner: boolean, expiryRule: 'year_end' | 'days' | 'none', expiryDays: number | null, modules: string[] }
export interface GrantOptions { roles: GrantRoleOption[], modules: string[], manage: boolean, yearEnd: number | null, allowNoExpiry: boolean }

const props = defineProps<{
  options: GrantOptions
  /** The person, when the page is about one; otherwise the dialogue asks for them. */
  person?: { id: string, name: string }
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { offer } = useUndo()
const { day, toLocal, zone } = useDates()

const blank = () => ({ accountId: props.person?.id as string | undefined, roleId: undefined as string | undefined, reach: 'site', ends: 'default' as 'default' | 'date', expiresOn: '' })
const form = reactive(blank())
const picked = ref<{ id: string, label: string } | undefined>()
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const giving = ref(false)
watch(open, (now) => {
  if (!now) return
  Object.assign(form, blank())
  picked.value = undefined
  refusal.value = null
})

const role = computed(() => props.options.roles.find(r => r.id === form.roleId))
const roleItems = computed(() => props.options.roles.map(r => ({ value: r.id, label: r.name })))
const moduleLabel = (id: string) => t(`${id}.module.name`)
const reachItems = computed(() => [
  { value: 'site', label: t('core.grants.scope.site') },
  ...(role.value?.modules ?? []).map(m => ({ value: m, label: t('core.grants.give.only-in', { module: moduleLabel(m) }) })),
])
watch(() => form.roleId, () => {
  form.reach = 'site'
  form.ends = defaultEnd.value === undefined ? 'date' : 'default'
})

// When a grant of the chosen role ends by its rule: a moment, null for never, or undefined when the
// rule gives no end the server would accept (the year end is not set, or roles must end).
const defaultEnd = computed<number | null | undefined>(() => {
  const r = role.value
  if (!r) return null
  if (r.expiryRule === 'year_end') return props.options.yearEnd ?? undefined
  if (r.expiryRule === 'days') return Date.now() + (r.expiryDays ?? 0) * 86_400_000 // not-policy: milliseconds in a day
  return r.owner || props.options.allowNoExpiry ? null : undefined
})
const defaultLabel = computed(() => {
  const r = role.value
  const end = defaultEnd.value
  if (!r || end === undefined) return ''
  if (end === null) return t('core.grants.give.ends-never')
  if (r.expiryRule === 'year_end') return t('core.grants.give.ends-year-end', { day: day(end) })
  return t('core.grants.give.ends-days', { count: r.expiryDays ?? 0, day: day(end) })
})
const noDefault = computed(() => {
  const r = role.value
  if (!r || defaultEnd.value !== undefined) return ''
  return r.expiryRule === 'year_end' ? t('core.grants.give.year-end-unset') : t('core.grants.give.must-end')
})
const endItems = computed(() => [
  ...(defaultEnd.value === undefined ? [] : [{ value: 'default', label: defaultLabel.value }]),
  { value: 'date', label: t('core.grants.give.ends-on-date') },
])
const tomorrow = computed(() => toLocal(Date.now() + 86_400_000).slice(0, 10)) // not-policy: a day ahead; the length of a date

const check = () => needs({
  accountId: form.accountId,
  roleId: form.roleId,
  expiresOn: form.ends === 'date' ? form.expiresOn : true,
})

async function give() {
  const r = role.value!
  const personName = props.person?.name ?? picked.value?.label ?? ''
  refusal.value = null
  giving.value = true
  try {
    const made = await $api<{ id: string }>('/api/core/grants', {
      method: 'POST',
      body: {
        accountId: form.accountId,
        roleId: r.id,
        scope: form.reach === 'site' ? { kind: 'site' } : { kind: 'module', module: form.reach },
        ...(form.ends === 'date' ? { expiresAt: parseDate(form.expiresOn).toDate(zone.value).getTime() } : {}),
      },
    })
    open.value = false
    const end: string = `/api/core/grants/${encodeURIComponent(made.id)}/end`
    offer(t('core.grants.give.done', { role: r.name, person: personName }), async () => {
      await $api<unknown>(end, { method: 'POST', body: {} })
      emit('changed')
    })
    emit('changed')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    const errors = fieldErrors(refusal.value)
    formEl.value?.setErrors(errors.map(x => x.name === 'expiresAt' ? { ...x, name: 'expiresOn' } : x))
  }
  finally {
    giving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="person ? t('core.grants.give.title-for', { person: person.name }) : t('core.grants.give.title')"
    :description="t('core.grants.give.description')"
  >
    <template #body>
      <UForm
        id="core-give-role"
        ref="formEl"
        :state="form"
        :validate="check"
        class="space-y-4"
        novalidate
        @submit="give"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="!person"
          name="accountId"
          :label="t('core.grants.column.person')"
          required
        >
          <PersonPicker
            v-model="form.accountId"
            @picked="(p) => { picked = p }"
          />
        </UFormField>
        <UFormField
          name="roleId"
          :label="t('core.grants.column.role')"
          required
        >
          <USelectMenu
            v-model="form.roleId"
            :items="roleItems"
            value-key="value"
            :placeholder="t('core.grants.give.choose-role')"
            :search-input="roleItems.length > 7 ? { placeholder: t('core.grants.give.search-roles') } : false"
          />
        </UFormField>
        <UFormField
          v-if="role?.modules.length"
          name="reach"
          :label="t('core.grants.column.scope')"
          :help="t('core.grants.give.reach-help')"
        >
          <USelect
            v-model="form.reach"
            :items="reachItems"
          />
        </UFormField>
        <UFormField
          v-if="role"
          name="ends"
          :label="t('core.roles.ends.label')"
          :help="noDefault || undefined"
        >
          <URadioGroup
            v-model="form.ends"
            :items="endItems"
          />
        </UFormField>
        <UFormField
          v-if="role && form.ends === 'date'"
          name="expiresOn"
          :label="t('core.grants.give.end-date')"
          required
        >
          <FieldDate
            v-model="form.expiresOn"
            :min="tomorrow"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="core-give-role"
        :loading="giving"
        :label="t('core.grants.give.button')"
      />
    </template>
  </UModal>
</template>
