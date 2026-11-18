<!-- Give a role (ID-23): to a person chosen with the picker, or to the one person a page is about.
     The role's reach is asked only when the role can be given for one module, and its end follows
     the role's own rule unless the giver picks a date. The grant can be undone from the toast.
     Opened from Who holds what and from a person's page; the server checks every grant. With
     `invite` it asks for a new person's name and address instead (ID-06): they are sent a link to
     sign in, and while the theatre cannot send email the link is shown here to pass on. -->
<script setup lang="ts">
import { parseDate } from '@internationalized/date'

export interface GrantRoleOption { id: string, name: string, owner: boolean, expiryRule: 'year_end' | 'days' | 'none', expiryDays: number | null, modules: string[] }
export interface GrantOptions { roles: GrantRoleOption[], modules: string[], manage: boolean, invite?: boolean, yearEnd: number | null, allowNoExpiry: boolean }

const props = defineProps<{
  options: GrantOptions
  /** The person, when the page is about one; otherwise the dialogue asks for them. */
  person?: { id: string, name: string }
  /** Invite somebody new by name and address. */
  invite?: boolean
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const { offer } = useUndo()
const { day, dateTime, toLocal, zone } = useDates()

const blank = () => ({ accountId: props.person?.id as string | undefined, name: '', address: '', roleId: undefined as string | undefined, reach: 'site', ends: 'default' as 'default' | 'date', expiresOn: '' })
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
  accountId: props.invite ? true : form.accountId,
  name: props.invite ? form.name : true,
  address: props.invite ? form.address : true,
  roleId: form.roleId,
  expiresOn: form.ends === 'date' ? form.expiresOn : true,
})

// The invitation's link, when it could not be emailed: shown once, to copy.
const link = ref<{ link: string, expiresAt: number, name: string } | null>(null)
const copied = ref(false)
async function copy() {
  if (!link.value) return
  try {
    await navigator.clipboard.writeText(link.value.link)
    copied.value = true
  }
  catch {
    copied.value = false
  }
}

async function give() {
  const r = role.value!
  const personName = props.person?.name ?? (props.invite ? form.name.trim() : picked.value?.label) ?? ''
  refusal.value = null
  giving.value = true
  try {
    const made = await $api<{ id: string, invited?: boolean, emailed?: boolean, link?: string, expiresAt?: number }>('/api/core/grants', {
      method: 'POST',
      body: {
        ...(props.invite ? { person: { name: form.name.trim(), address: form.address.trim() } } : { accountId: form.accountId }),
        roleId: r.id,
        scope: form.reach === 'site' ? { kind: 'site' } : { kind: 'module', module: form.reach },
        ...(form.ends === 'date' ? { expiresAt: parseDate(form.expiresOn).toDate(zone.value).getTime() } : {}),
      },
    })
    open.value = false
    if (made.invited) {
      emit('changed')
      if (made.link) {
        copied.value = false
        link.value = { link: made.link, expiresAt: made.expiresAt!, name: personName }
      }
      else toast.add({ title: t('core.grants.invite.sent', { person: personName }), description: t('core.grants.invite.sent-help', { address: form.address.trim() }), color: 'success' })
      return
    }
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
    const renamed: Record<string, string> = { 'expiresAt': 'expiresOn', 'person.address': 'address', 'person.name': 'name' }
    formEl.value?.setErrors(errors.map(x => renamed[x.name] ? { ...x, name: renamed[x.name]! } : x))
  }
  finally {
    giving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="invite ? t('core.grants.invite.title') : person ? t('core.grants.give.title-for', { person: person.name }) : t('core.grants.give.title')"
    :description="invite ? t('core.grants.invite.description') : t('core.grants.give.description')"
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
        <template v-if="invite">
          <UFormField
            name="name"
            :label="t('core.grants.invite.name')"
            required
          >
            <UInput
              v-model="form.name"
              autocomplete="off"
              maxlength="200"
            />
          </UFormField>
          <UFormField
            name="address"
            :label="t('core.grants.invite.address')"
            :help="t('core.grants.invite.address-help')"
            required
          >
            <UInput
              v-model="form.address"
              type="email"
              autocomplete="off"
              maxlength="254"
            />
          </UFormField>
        </template>
        <UFormField
          v-else-if="!person"
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
        :label="invite ? t('core.grants.invite.button') : t('core.grants.give.button')"
      />
    </template>
  </UModal>

  <UModal
    :open="!!link"
    :title="t('core.grants.invite.link-title', { person: link?.name ?? '' })"
    :description="t('core.grants.invite.link-description', { when: link ? dateTime(link.expiresAt) : '' })"
    @update:open="(now: boolean) => { if (!now) link = null }"
  >
    <template #body>
      <div class="flex gap-2">
        <UInput
          :model-value="link?.link"
          readonly
          class="flex-1"
          :aria-label="t('core.grants.invite.link')"
        />
        <UButton
          color="neutral"
          variant="outline"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          :label="copied ? t('core.grants.invite.copied') : t('core.grants.invite.copy')"
          @click="copy"
        />
      </div>
    </template>
  </UModal>
</template>
