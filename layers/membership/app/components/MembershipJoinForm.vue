<!-- Joining one scheme (MEM-11): the length, where there is a choice, and the reference the scheme's
     list checks, then Join. Sent to the same join route as My membership. What happens next follows
     the answer: a fee goes on to the Pay page, a check by the theatre says it is waiting, and a
     members' scheme opens the members' area. A refusal is shown beside its field. -->
<script setup lang="ts">
import type { OfferedScheme } from '../utils/membership-join'

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

async function join() {
  refusal.value = null
  try {
    const joined = await $api<{ pending: boolean, membershipId: string, waiting?: string, opensMembersArea?: boolean }>(`/api/membership/schemes/${props.scheme.id}/join` as string, {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
      body: {
        lengthOptionId: state.lengthOptionId ?? (props.scheme.options.length === 1 ? props.scheme.options[0]!.id : null),
        reference: props.scheme.asksFor ? state.reference.trim() : undefined,
      },
    })
    if (joined.waiting === 'payment') return navigateTo(`/account/membership/${joined.membershipId}/pay`)
    if (joined.pending) {
      toast.add({ title: t('membership.screens.mine.applied', { scheme: props.scheme.name }), description: t('membership.screens.mine.waiting-staff'), color: 'success' })
      emit('applied')
      return
    }
    toast.add({ title: t('membership.screens.mine.joined', { scheme: props.scheme.name }), color: 'success' })
    // A members' scheme opens the members' area from this response on: load afresh so the header shows it.
    reloadNuxtApp({ path: joined.opensMembersArea ? '/members' : '/account/membership' })
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <UForm
    ref="formEl"
    :state="state"
    :validate="() => needs({ lengthOptionId: choosing ? state.lengthOptionId : true, reference: scheme.asksFor ? state.reference : true })"
    class="space-y-4"
    novalidate
    @submit="join"
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
      type="submit"
      loading-auto
      :label="t('membership.join.submit', { scheme: scheme.name })"
    />
  </UForm>
</template>
