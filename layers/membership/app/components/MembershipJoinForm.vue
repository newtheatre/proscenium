<!-- Joining one scheme (MEM-11): the length, where there is a choice, and the reference the scheme's
     list checks, then Join. Sent to the same join route as My membership. What happens next follows
     the answer: a fee goes on to the Pay page, a check by the theatre says it is waiting, and a
     members' scheme opens the members' area. A refusal is shown beside its field. A scheme with an
     application form (MEM-12) asks it below the length and reference, and the form's own last
     button joins, checking the fields above with every Continue. -->
<script setup lang="ts">
import type { OfferedScheme } from '../utils/membership-join'
import type { FormsFill } from '#components'

// The form builder's own shapes, through its component's props.
type FillProps = InstanceType<typeof FormsFill>['$props']
type Answers = NonNullable<FillProps['modelValue']>
type Definition = FillProps['definition']

const props = defineProps<{ scheme: OfferedScheme }>()
const emit = defineEmits<{ applied: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()

const state = reactive({ lengthOptionId: undefined as string | undefined, reference: '' })
const choosing = computed(() => props.scheme.options.length > 1)
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const formEl = useTemplateRef<{ setErrors: (errors: { name: string, message: string }[]) => void }>('formEl')
const lengths = computed(() => props.scheme.options.map(o => ({ value: o.id, label: o.fee ? `${o.name}, ${membershipMoney(o.fee)}` : o.name })))

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
        lengthOptionId: state.lengthOptionId ?? (props.scheme.options.length === 1 ? props.scheme.options[0]!.id : null),
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
      toast.add({ title: t('membership.screens.mine.applied', { scheme: props.scheme.name }), description: t(joined.waiting === 'approval' ? 'membership.screens.mine.waiting-approval' : joined.waiting === 'not-on-list' ? 'membership.screens.mine.waiting-not-on-list' : 'membership.screens.mine.waiting-staff'), color: 'success' })
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
    formEl.value?.setErrors(fieldErrors(refusal.value))
    return false
  }
}
</script>

<template>
  <UForm
    ref="formEl"
    :state="state"
    :validate="missing"
    class="space-y-4"
    novalidate
    @submit="join()"
  >
    <RefusalNotice :refusal="refusal" />
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
    <UFormField
      v-if="scheme.asksFor"
      name="reference"
      :label="scheme.asksFor"
      required
    >
      <UInput
        v-model="state.reference"
        autocomplete="off"
        maxlength="254"
      />
    </UFormField>
    <UButton
      v-if="refusal?.code === 'membership.join.not-on-list' && scheme.asksFor"
      color="neutral"
      variant="outline"
      size="sm"
      loading-auto
      :label="t('membership.join.ask-staff')"
      @click="join(lastAnswers, true)"
    />
    <UButton
      v-if="!scheme.applicationForm"
      type="submit"
      loading-auto
      :label="t('membership.join.submit', { scheme: scheme.name })"
    />
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
