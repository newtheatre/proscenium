<!-- The supplier's own invoice kept with a bill (rule I-11): opened in a new tab, and while the bill
     is a draft, uploaded or replaced. A bill is not submitted without it. -->
<script setup lang="ts">
const props = defineProps<{ url: string | null, canChange: boolean, /** Uploads and keeps the file. */ attach: (file: File) => Promise<void> }>()

const { t } = useT()
const TYPES = 'application/pdf,image/png,image/jpeg'
const busy = ref(false)
const picked = ref<File | null>(null)
async function choose(chosen: File | File[] | null | undefined) {
  picked.value = null
  const file = [chosen ?? []].flat()[0]
  if (!file) return
  busy.value = true
  try { await props.attach(file) }
  finally { busy.value = false }
}
</script>

<template>
  <PageSection :title="t('invoicing.screens.bill.file')">
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        v-if="url"
        :to="url"
        target="_blank"
        external
        :label="t('invoicing.screens.bill.file-open')"
        icon="i-lucide-file-text"
        color="neutral"
        variant="outline"
      />
      <p
        v-else
        class="text-sm text-muted"
      >
        {{ t('invoicing.screens.bill.file-none') }}
      </p>
      <UFileUpload
        v-if="canChange"
        v-slot="{ open }"
        :accept="TYPES"
        :model-value="picked"
        :dropzone="false"
        :interactive="false"
        :preview="false"
        @update:model-value="choose"
      >
        <UButton
          :label="url ? t('invoicing.screens.bill.file-replace') : t('invoicing.screens.bill.file-upload')"
          icon="i-lucide-upload"
          color="neutral"
          variant="outline"
          :loading="busy"
          @click="open()"
        />
      </UFileUpload>
    </div>
  </PageSection>
</template>
