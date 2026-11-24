<!-- K9's panel (TR-47; E4 to E7): one certificate or declaration with what was sent and its file, then
     "Verify" or "Not approved", which needs a reason the person reads. Opening it is audited. -->
<script setup lang="ts">
import type { EvidenceView } from '../../server/evidence'

const props = defineProps<{ evidence: EvidenceView | null }>()
const emit = defineEmits<{ close: [], decided: [] }>()
const { t } = useT()
const { day } = useDates()
const act = useTrainingAct()
const toast = useToast()
const { refusal, busy, attempt } = useDialogAct()
const rejecting = ref(false)
const reason = ref('')
watch(() => props.evidence?.id, () => {
  rejecting.value = false
  reason.value = ''
  refusal.value = null
})
const open = computed({ get: () => !!props.evidence, set: (v) => { if (!v) emit('close') } })
const person = computed(() => props.evidence?.person ?? t('training.teaching.no-name'))

const facts = computed(() => {
  const e = props.evidence
  if (!e) return []
  const dated = (v: string | null) => v ? day(v) : null
  return [
    [t('training.evidence-review.course'), `${e.course}: ${e.step}`],
    [t('training.evidence-review.qualification'), e.qualification],
    [t('training.evidence-review.issuer'), e.issuer],
    [t('training.evidence-review.reference'), e.reference],
    [t('training.evidence-review.issued'), dated(e.issuedOn)],
    [t('training.evidence-review.expires'), dated(e.expiresOn)],
    [t('training.evidence-review.statement'), e.statement],
    [t('training.evidence-review.organisation'), e.organisation],
    [t('training.evidence-review.when'), e.doneFrom ? [dated(e.doneFrom), dated(e.doneTo)].filter(Boolean).join(t('training.evidence-review.to')) : null],
    [t('training.evidence-review.referee'), e.referee],
    [t('training.evidence-review.sent'), day(e.createdAt)],
  ].filter((f): f is [string, string] => !!f[1])
})

async function decide(verdict: 'verify' | 'reject') {
  const e = props.evidence
  if (!e) return
  const body = verdict === 'reject' ? { reason: reason.value.trim() } : {}
  if (!await attempt(() => act(`/api/training/evidence/${encodeURIComponent(e.id)}/${verdict}`, { method: 'POST', body }))) return
  toast.add({ title: t(`training.evidence-review.${verdict}-done`, { name: person.value }), color: 'success' })
  emit('decided')
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="evidence ? t(`training.evidence-review.title.${evidence.kind}`, { name: person }) : ''"
    :description="evidence?.course"
  >
    <template #body>
      <div
        v-if="evidence"
        class="space-y-6"
      >
        <RefusalNotice :refusal="refusal" />
        <UAlert
          v-if="evidence.notOnList"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="t('training.evidence-review.not-on-list')"
        />
        <dl class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
          <template
            v-for="[label, value] in facts"
            :key="label"
          >
            <dt class="text-sm text-muted">
              {{ label }}
            </dt>
            <dd class="whitespace-pre-line">
              {{ value }}
            </dd>
          </template>
        </dl>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="evidence.fileUrl"
            color="neutral"
            variant="outline"
            icon="i-lucide-file"
            :to="evidence.fileUrl"
            target="_blank"
            :label="t('training.evidence-review.file')"
          />
          <UButton
            v-if="evidence.linkUrl"
            color="neutral"
            variant="outline"
            icon="i-lucide-external-link"
            :to="evidence.linkUrl"
            target="_blank"
            rel="noopener noreferrer"
            :label="t('training.evidence-review.link')"
          />
        </div>
        <UFormField
          v-if="rejecting"
          :label="t('training.evidence-review.reason')"
          :help="t('training.evidence-review.reason-help')"
          required
        >
          <UTextarea
            v-model="reason"
            :rows="3"
            maxlength="300"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <template v-if="rejecting">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('training.evidence-review.back')"
            @click="rejecting = false"
          />
          <UButton
            color="error"
            :loading="busy"
            :disabled="!reason.trim()"
            :label="t('training.evidence-review.reject')"
            @click="decide('reject')"
          />
        </template>
        <template v-else>
          <UButton
            color="neutral"
            variant="outline"
            :label="t('training.evidence-review.reject')"
            @click="rejecting = true"
          />
          <UButton
            icon="i-lucide-check"
            :loading="busy"
            :label="t('training.evidence-review.verify')"
            @click="decide('verify')"
          />
        </template>
      </div>
    </template>
  </USlideover>
</template>
