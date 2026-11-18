<!-- Adding a member directly (MEM-24): a person by address, for one scheme, with the length on sale,
     dates by hand, the fee settled (P9) and, for a scheme checked against a list of references, an
     optional student ID that is checked and claimed. Opened from a scheme's page (that scheme) and
     from Console > Members (the secretary picks one; the only open scheme is chosen already). -->
<script setup lang="ts">
import { z } from 'zod'
import type { MembershipSchemeChoice } from '../../shared/scheme-choice'

const props = defineProps<{ schemes: MembershipSchemeChoice[], schemeId?: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [] }>()

const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const { toLocal } = useDates()
const toast = useToast()

const choices = computed(() => props.schemes.filter(s => s.canAdd))
const member = reactive({ schemeId: '', name: '', address: '', lengthOptionId: undefined as string | undefined, startsOn: '', endsOn: '', reference: '', note: '', fee: 'link' as 'link' | 'waive', idempotency: '' })
const scheme = computed(() => choices.value.find(s => s.id === member.schemeId))
// P9: for a scheme whose fee is collected through the system, a link to pay or a waiver.
const asksFee = computed(() => !!scheme.value?.feesOn)
const byLink = computed(() => asksFee.value && member.fee === 'link')
const asksLength = computed(() => !!scheme.value && scheme.value.lengthRule !== 'indefinite' && scheme.value.options.length > 1)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const form = useTemplateRef('form')

const today = computed(() => toLocal(Date.now()).slice(0, 10)) // not-policy: the length of a date
const alreadyEnded = computed(() => !byLink.value && !!member.endsOn && member.endsOn < today.value)

// What the add route checks, beside each field; a waived fee needs its reason.
const schema = z.object({
  schemeId: z.string().min(1, t('core.form.invalid.required')),
  address: z.string().trim().email().max(254), // not-policy: the longest address there is
  name: z.string().trim().max(120), // not-policy: shape bound
  note: z.string().trim().max(1000), // not-policy: shape bound
}).passthrough().superRefine((value, ctx) => {
  if (asksFee.value && member.fee === 'waive' && !value.note) ctx.addIssue({ code: 'custom', path: ['note'], message: t('core.form.invalid.required') })
})

function pick(id: string | undefined) {
  member.schemeId = id ?? ''
  member.lengthOptionId = scheme.value?.options[0]?.id
  member.fee = 'link'
  member.reference = ''
}
watch(open, (now) => {
  if (!now) return
  Object.assign(member, { name: '', address: '', startsOn: '', endsOn: '', note: '', idempotency: crypto.randomUUID() })
  pick(props.schemeId && choices.value.some(s => s.id === props.schemeId) ? props.schemeId : choices.value.length === 1 ? choices.value[0]!.id : undefined)
  refusal.value = null
})

async function submit() {
  refusal.value = null
  if (!scheme.value) return
  try {
    const added = await $api<{ opensMembersArea: boolean, waiting?: string }>(`/api/membership/schemes/${scheme.value.id}/members` as string, {
      method: 'POST',
      headers: { 'idempotency-key': member.idempotency },
      body: {
        name: member.name.trim() || undefined,
        address: member.address.trim(),
        lengthOptionId: asksLength.value ? member.lengthOptionId ?? null : null,
        note: member.note.trim() || undefined,
        ...(scheme.value.reference && member.reference.trim() ? { reference: member.reference.trim() } : {}),
        ...(byLink.value ? {} : { startsOn: member.startsOn || undefined, endsOn: member.endsOn || undefined }),
        ...(asksFee.value ? { fee: member.fee } : {}),
      },
    })
    open.value = false
    if (added.waiting === 'payment') toast.add({ title: t('membership.screens.add-member.link-sent'), color: 'success' })
    else toast.add({ title: t('membership.screens.add-member.added'), description: t(added.opensMembersArea ? 'membership.screens.add-member.opens-area' : 'membership.screens.add-member.no-area'), color: 'success' })
    emit('added')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    form.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('membership.screens.add-member.title')"
    :description="t('membership.screens.add-member.help')"
  >
    <template #body>
      <UForm
        id="membership-add-member"
        ref="form"
        :schema="schema"
        :state="member"
        class="space-y-4"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <UFormField
          v-if="choices.length > 1"
          name="schemeId"
          :label="t('membership.screens.add-member.scheme')"
          required
        >
          <USelect
            :model-value="member.schemeId || undefined"
            :items="choices.map(s => ({ value: s.id, label: s.name }))"
            :placeholder="t('membership.screens.add-member.scheme-placeholder')"
            @update:model-value="pick($event as string)"
          />
        </UFormField>
        <template v-if="scheme">
          <UFormField
            name="address"
            :label="t('membership.screens.add-member.address')"
            required
          >
            <UInput
              v-model="member.address"
              type="email"
              autocomplete="off"
            />
          </UFormField>
          <UFormField
            name="name"
            :label="t('membership.screens.add-member.name')"
            :help="t('membership.screens.add-member.name-help')"
          >
            <UInput
              v-model="member.name"
              maxlength="120"
              autocomplete="off"
            />
          </UFormField>
          <UFormField
            v-if="scheme.reference"
            name="reference"
            :label="scheme.reference.label ?? t('membership.screens.add-member.reference')"
            :help="t('membership.screens.add-member.reference-help', { list: scheme.reference.listName })"
          >
            <UInput
              v-model="member.reference"
              maxlength="60"
              autocomplete="off"
            />
          </UFormField>
          <UFormField
            v-if="asksLength"
            name="lengthOptionId"
            :label="t('membership.screens.add-member.length')"
          >
            <USelect
              v-model="member.lengthOptionId"
              :items="scheme.options.map(o => ({ value: o.id, label: o.name }))"
            />
          </UFormField>
          <UFormField
            v-if="asksFee"
            name="fee"
            :label="t('membership.screens.add-member.fee')"
          >
            <URadioGroup
              v-model="member.fee"
              :items="(['link', 'waive'] as const).map(v => ({ value: v, label: t(`membership.screens.add-member.fee-${v}`), description: t(`membership.screens.add-member.fee-${v}-help`) }))"
            />
          </UFormField>
          <div
            v-if="!byLink"
            class="grid gap-4 sm:grid-cols-2"
          >
            <UFormField
              name="startsOn"
              :label="t('membership.screens.add-member.starts')"
              :help="t('membership.screens.add-member.starts-help')"
            >
              <FieldDate v-model="member.startsOn" />
            </UFormField>
            <UFormField
              name="endsOn"
              :label="t('membership.screens.add-member.ends')"
              :help="t('membership.screens.add-member.ends-help')"
            >
              <FieldDate
                v-model="member.endsOn"
                :min="member.startsOn || undefined"
              />
            </UFormField>
          </div>
          <UAlert
            v-if="alreadyEnded"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('membership.screens.add-member.already-ended')"
            :description="t('membership.screens.add-member.already-ended-help')"
          />
          <UFormField
            name="note"
            :label="t('membership.screens.add-member.note')"
            :help="asksFee && member.fee === 'waive' ? t('membership.screens.add-member.waive-note-help') : t('membership.screens.add-member.note-help')"
            :required="asksFee && member.fee === 'waive'"
          >
            <UTextarea
              v-model="member.note"
              maxlength="1000"
              :rows="2"
            />
          </UFormField>
        </template>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="membership-add-member"
        loading-auto
        :label="t('membership.screens.add-member.submit')"
      />
    </template>
  </UModal>
</template>
