<!-- M6 Add a certificate and M12 Declare experience (training-records part 5; amended part 5): a
     panel over the course. Fields the step forbids are absent; a step that lists recognised
     qualifications offers them first, with "Something else" only where it is allowed. -->
<script setup lang="ts">
import type { EvidenceStep } from '../composables/useEvidenceForm'

const props = defineProps<{ courseId: string, step: EvidenceStep | null }>()
const emit = defineEmits<{ close: [], sent: [] }>()
const { t } = useT()
const { toLocal } = useDates()
const { toRefusal, fieldErrors } = useRefusal()
const toast = useToast()
const formEl = useFormRef('formEl')
const refusal = ref<ReturnType<typeof toRefusal> | null>(null)
const { form, certificate, qualificationItems, issuers, shows, check, send } = useEvidenceForm(toRef(props, 'courseId'), toRef(props, 'step'))
const today = computed(() => toLocal(Date.now()).slice(0, 10)) // not-policy: the length of a date
watch(() => props.step, () => { refusal.value = null })

async function submit() {
  refusal.value = null
  try {
    await send()
    toast.add({ title: t(certificate.value ? 'training.evidence.sent-certificate' : 'training.evidence.sent-declaration'), color: 'success' })
    emit('sent')
  }
  catch (e) {
    refusal.value = toRefusal(e)
    formEl.value?.setErrors(fieldErrors(refusal.value))
  }
}
</script>

<template>
  <USlideover
    :open="!!step"
    :title="step ? t(certificate ? 'training.evidence.certificate-title' : 'training.evidence.declaration-title', { step: step.title }) : ''"
    :description="t(certificate ? 'training.evidence.certificate-help' : 'training.evidence.declaration-help')"
    @update:open="v => { if (!v) emit('close') }"
  >
    <template #body>
      <UForm
        id="training-evidence"
        ref="formEl"
        :state="form"
        :validate="check"
        class="space-y-4"
        novalidate
        @submit="submit"
      >
        <RefusalNotice :refusal="refusal" />
        <template v-if="certificate">
          <UFormField
            v-if="qualificationItems.length && step?.action.qualifications.length"
            name="qualification"
            :label="t('training.evidence.qualification')"
            required
          >
            <USelectMenu
              v-model="form.qualification"
              value-key="value"
              :items="qualificationItems"
            />
          </UFormField>
          <UFormField
            v-if="shows.otherQualification"
            name="otherQualification"
            :label="t(step?.action.qualifications.length ? 'training.evidence.qualification-other' : 'training.evidence.qualification')"
          >
            <UInput
              v-model="form.otherQualification"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            name="issuer"
            :label="t('training.evidence.issuer')"
            required
          >
            <USelectMenu
              v-if="issuers.length"
              v-model="form.issuer"
              :items="issuers"
              create-item
              @create="(v: string) => { form.issuer = v }"
            />
            <UInput
              v-else
              v-model="form.issuer"
              maxlength="120"
            />
          </UFormField>
          <UFormField
            name="issuedOn"
            :label="t('training.evidence.issued-on')"
            required
          >
            <FieldDate
              v-model="form.issuedOn"
              :max="today"
            />
          </UFormField>
          <UFormField
            v-if="shows.expiry"
            name="expiresOn"
            :label="t('training.evidence.expires-on')"
            :required="step?.action.expiry === 'required'"
          >
            <FieldDate
              v-model="form.expiresOn"
              :min="today"
            />
          </UFormField>
          <UFormField
            v-if="shows.file"
            name="reference"
            :label="t('training.evidence.reference')"
          >
            <UInput
              v-model="form.reference"
              maxlength="80"
            />
          </UFormField>
        </template>
        <template v-else>
          <UFormField
            name="statement"
            :label="t('training.evidence.statement')"
            :help="t('training.evidence.statement-help')"
            required
          >
            <UTextarea
              v-model="form.statement"
              :rows="5"
              maxlength="2000"
            />
          </UFormField>
          <UFormField
            name="organisation"
            :label="t('training.evidence.organisation')"
          >
            <UInput
              v-model="form.organisation"
              maxlength="120"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              name="doneFrom"
              :label="t('training.evidence.done-from')"
            >
              <FieldDate
                v-model="form.doneFrom"
                :max="today"
              />
            </UFormField>
            <UFormField
              name="doneTo"
              :label="t('training.evidence.done-to')"
            >
              <FieldDate
                v-model="form.doneTo"
                :min="form.doneFrom || undefined"
              />
            </UFormField>
          </div>
          <UFormField
            name="linkUrl"
            :label="t('training.evidence.link')"
          >
            <UInput
              v-model="form.linkUrl"
              type="url"
              maxlength="500"
            />
          </UFormField>
          <UFormField
            name="referee"
            :label="t('training.evidence.referee')"
            :help="t('training.evidence.referee-help')"
          >
            <UInput
              v-model="form.referee"
              maxlength="200"
            />
          </UFormField>
        </template>
        <UFormField
          v-if="shows.file"
          name="file"
          :label="t('training.evidence.file')"
          :required="step?.action.file === 'required'"
        >
          <UFileUpload
            v-model="form.file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
            :label="t('training.evidence.file-drop')"
            :description="t('training.evidence.file-help')"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="training-evidence"
        :loading="formEl?.loading"
        :label="t(certificate ? 'training.evidence.send-certificate' : 'training.evidence.send-declaration')"
      />
    </template>
  </USlideover>
</template>
