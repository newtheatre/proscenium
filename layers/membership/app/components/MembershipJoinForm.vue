<!-- Joining one scheme (MEM-11), on its join page and in My membership's Join dialog alike: the
     length, where there is a choice, and the reference the scheme's list checks, then Join. With
     `form-id` the dialog's own footer button submits it. A fee goes on to the Pay page, a check by
     the theatre says it is waiting, and a members' scheme opens the members' area. A refusal about a
     field is said under it once, with its contact link. A scheme with an application form (MEM-12)
     asks it below, and the form's own last button joins, checking the fields above with every Continue. -->
<script setup lang="ts">
import type { OfferedScheme } from '../utils/membership-join'
import type { FormsFill } from '#components'

// The form builder's own shapes, through its component's props.
type FillProps = InstanceType<typeof FormsFill>['$props']
type Answers = NonNullable<FillProps['modelValue']>
type Definition = FillProps['definition']

const props = defineProps<{ scheme: OfferedScheme, formId?: string }>()
const emit = defineEmits<{ applied: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()

const state = reactive({ lengthOptionId: undefined as string | undefined, reference: '' })
// A list that sets the end date leaves no length to choose (finding: a chosen length was ignored).
const options = computed(() => props.scheme.endsByList ? [] : props.scheme.options)
const choosing = computed(() => options.value.length > 1)
const lengths = computed(() => options.value.map(o => ({ value: o.id, label: o.fee ? `${o.name}, ${membershipMoney(o.fee)}` : o.name })))
const price = computed(() => {
  const option = options.value.length === 1 ? options.value[0] : options.value.find(o => o.id === state.lengthOptionId)
  const fee = option?.fee ?? props.scheme.fee
  // A scheme that checks a list is bought where the list is kept, so no fee here is not free.
  return fee ? membershipMoney(fee) : props.scheme.requiresPayment || props.scheme.asksFor ? null : t('membership.screens.mine.free')
})
const facts = computed(() => [
  ...(props.scheme.endsByList
    ? [{ label: t('membership.screens.mine.length'), value: t('membership.screens.mine.ends-by-list') }]
    : options.value.length === 1
      ? [{ label: t('membership.screens.mine.length'), value: options.value[0]!.name }]
      : options.value.length ? [] : [{ label: t('membership.screens.mine.length'), value: t('membership.screens.mine.no-end') }]),
  ...(price.value ? [{ label: t('membership.screens.mine.price'), value: price.value }] : []),
])

const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const referenceRefused = computed(() => !!props.scheme.asksFor && !!refusal.value?.fields?.reference)
// Said under its field instead, so it is not said twice.
const notice = computed(() => refusal.value && !referenceRefused.value && !(choosing.value && refusal.value.fields?.lengthOptionId) ? refusal.value : null)
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')

interface ApplicationForm { formId: string, title: string, state: string, definition: Definition | null, draft: { answers: Answers } | null }
const application = props.scheme.applicationForm
  ? await useAPI<{ today: string, form: ApplicationForm | null }>(() => `/api/membership/schemes/${props.scheme.id}/form`, { key: `membership:application-form:${props.scheme.id}` })
  : null
const form = computed(() => application?.data.value?.form ?? null)
const answers = ref<Answers>({})
watch(form, (now) => {
  if (now?.draft) answers.value = { ...now.draft.answers }
}, { immediate: true })
const missing = () => needs({ lengthOptionId: choosing.value ? state.lengthOptionId : true, reference: props.scheme.asksFor ? state.reference : true })
/** The fields above the application form, checked with each of its Continues. */
function fieldsGiven(): boolean {
  const errors = missing()
  formEl.value?.setErrors(errors)
  return !errors.length
}
/** Why an application waits on the theatre, in the applicant's words. */
const waitingText = (reason: string | undefined) => t(reason === 'entry-already-used' || reason === 'name-differs' || reason === 'not-on-list' || reason === 'approval' ? `membership.screens.mine.waiting-${reason}` : 'membership.screens.mine.waiting-staff')

/** The answers last sent, so asking staff to check an ID sends them again. */
let lastAnswers: Answers | undefined
async function join(given?: Answers, askStaff = false): Promise<boolean> {
  lastAnswers = given
  refusal.value = null
  try {
    const joined = await $api<{ pending: boolean, membershipId: string, waiting?: string, opensMembersArea?: boolean }>(`/api/membership/schemes/${props.scheme.id}/join` as string, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        lengthOptionId: props.scheme.endsByList ? null : state.lengthOptionId ?? (options.value.length === 1 ? options.value[0]!.id : null),
        reference: props.scheme.asksFor ? state.reference.trim() : undefined,
        ...(given && form.value ? { form: { formId: form.value.formId, answers: given } } : {}),
        ...(askStaff ? { askStaff: true } : {}),
      },
    })
    if (joined.waiting === 'payment') {
      await navigateTo(`/account/membership/${joined.membershipId}/pay`)
      return true
    }
    if (joined.pending) {
      toast.add({ title: t('membership.screens.mine.applied', { scheme: props.scheme.name }), description: waitingText(joined.waiting), color: 'success' })
      emit('applied')
      return true
    }
    toast.add({ title: t('membership.screens.mine.joined', { scheme: props.scheme.name }), color: 'success' })
    // A members' scheme opens the members' area from this response on: load afresh so the header shows it.
    reloadNuxtApp({ path: joined.opensMembersArea ? '/members' : '/account/membership' })
    return true
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors({ fields: Object.fromEntries(Object.entries(refusal.value.fields ?? {}).filter(([name]) => name !== 'reference')) }))
    return false
  }
}
const askStaff = computed(() => refusal.value?.code === 'membership.join.not-on-list' && !!props.scheme.asksFor)
const ownButton = computed(() => !props.formId && !props.scheme.applicationForm)
</script>

<template>
  <UForm
    :id="formId"
    ref="formEl"
    :state="state"
    :validate="missing"
    class="space-y-4"
    novalidate
    @submit="join()"
  >
    <RefusalNotice :refusal="notice" />
    <UFormField
      v-if="choosing"
      name="lengthOptionId"
      :label="t('membership.screens.mine.choose-length')"
      required
    >
      <USelect
        v-model="state.lengthOptionId"
        :items="lengths"
      />
    </UFormField>
    <FactStrip :facts="facts" />
    <UFormField
      v-if="scheme.asksFor"
      name="reference"
      :label="scheme.asksFor"
      :error="referenceRefused ? refusal!.reason : undefined"
      required
    >
      <UInput
        v-model="state.reference"
        autocomplete="off"
        maxlength="254"
      />
      <template
        v-if="referenceRefused"
        #error
      >
        <MembershipRefusalText
          :reason="refusal!.reason"
          :remedy="refusal!.remedy"
        />
      </template>
    </UFormField>
    <p
      v-if="scheme.requiresPayment"
      class="text-sm text-muted"
    >
      {{ t('membership.screens.mine.join-pays') }}
    </p>
    <div
      v-if="ownButton || askStaff"
      class="flex flex-wrap items-center gap-2"
    >
      <UButton
        v-if="ownButton"
        type="submit"
        loading-auto
        :label="t('membership.join.submit', { scheme: scheme.name })"
      />
      <UButton
        v-if="askStaff"
        color="neutral"
        variant="outline"
        loading-auto
        :label="t('membership.join.ask-staff')"
        @click="join(lastAnswers, true)"
      />
    </div>
  </UForm>
  <template v-if="scheme.applicationForm">
    <p
      v-if="application?.error.value"
      class="text-sm text-muted"
    >
      {{ t('membership.join.form-unavailable') }}
    </p>
    <p
      v-else-if="form && !form.definition"
      class="text-sm text-muted"
    >
      {{ t('membership.join.form-shut') }}
    </p>
    <div
      v-else-if="form?.definition"
      class="space-y-2"
      :class="{ 'mt-6': choosing || scheme.asksFor }"
    >
      <h3 class="font-medium">
        {{ form.title }}
      </h3>
      <FormsFill
        v-model="answers"
        :definition="form.definition"
        :context="{ today: application!.data.value!.today }"
        :send-label="t('membership.join.submit', { scheme: scheme.name })"
        :send="join"
        :check="fieldsGiven"
      />
    </div>
  </template>
</template>
