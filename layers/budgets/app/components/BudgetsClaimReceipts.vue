<!-- An item's receipts (BC-19, BC-21): each opens in a new tab, images shown small. While the claim is
     the claimant's to change, a photo is taken or a file chosen and uploaded at once; the platform
     checks it, and a file it does not accept says so. -->
<script setup lang="ts">
import type { ClaimItem } from '../composables/useClaim'

const props = defineProps<{ claimId: string, item: ClaimItem, editable?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t } = useT()
const { $api } = useNuxtApp()
const { toRefusal } = useRefusal()
const input = useTemplateRef<HTMLInputElement>('input')
const busy = ref(false)
const problem = ref('')
const full = computed(() => props.item.receipts.filter(r => r.state !== 'rejected').length >= 5) // not-policy: the server's bound on one item's receipts
const base = computed(() => `/api/budgets/claims/${props.claimId}/items/${props.item.id}/receipts`)

async function add(event: Event) {
  const target = event.target as HTMLInputElement
  const chosen = [...(target.files ?? [])]
  target.value = ''
  if (!chosen.length) return
  problem.value = ''
  busy.value = true
  try {
    for (const file of chosen) {
      try {
        await $api(base.value as string, { method: 'POST', query: { name: file.name }, body: file, headers: { 'content-type': file.type || 'application/octet-stream' } })
      }
      catch (e) {
        problem.value = t('budgets.screens.claims.receipt-not-added', { name: file.name, reason: toRefusal(e).reason })
      }
    }
  }
  finally {
    busy.value = false
    emit('changed')
  }
}
async function remove(fileId: string) {
  try {
    await $api(`${base.value}/${fileId}` as string, { method: 'DELETE', body: {} })
  }
  catch (e) {
    problem.value = toRefusal(e).reason
  }
  emit('changed')
}
const stateWord = (state: string) => state === 'pending' ? t('budgets.screens.claims.receipt-checking') : state === 'rejected' ? t('budgets.screens.claims.receipt-refused') : null
</script>

<template>
  <div class="space-y-2">
    <ul
      v-if="item.receipts.length"
      class="flex flex-wrap gap-2"
      :aria-label="t('budgets.screens.claims.receipts')"
    >
      <li
        v-for="r in item.receipts"
        :key="r.id"
        class="flex items-center gap-2 rounded-md border border-default px-2 py-1 text-sm"
      >
        <img
          v-if="r.state === 'ready' && r.mediaType.startsWith('image/')"
          :src="`/files/${r.id}`"
          :alt="r.name ?? t('budgets.screens.claims.receipt')"
          class="size-10 rounded object-cover"
        >
        <ULink
          v-if="r.state === 'ready'"
          :to="`/files/${r.id}`"
          target="_blank"
          class="underline"
        >
          {{ r.name ?? t('budgets.screens.claims.receipt') }}
        </ULink>
        <span v-else>{{ r.name ?? t('budgets.screens.claims.receipt') }}</span>
        <span
          v-if="stateWord(r.state)"
          class="text-muted"
        >{{ stateWord(r.state) }}</span>
        <IconButton
          v-if="editable"
          icon="i-lucide-x"
          :label="t('budgets.screens.claims.receipt-remove', { name: r.name ?? '' })"
          @click="remove(r.id)"
        />
      </li>
    </ul>
    <template v-if="editable && !full">
      <input
        ref="input"
        type="file"
        class="sr-only"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        :aria-label="t('budgets.screens.claims.receipt-add')"
        tabindex="-1"
        @change="add"
      >
      <UButton
        icon="i-lucide-camera"
        color="neutral"
        variant="outline"
        size="sm"
        :loading="busy"
        :label="t(item.receipts.length ? 'budgets.screens.claims.receipt-another' : 'budgets.screens.claims.receipt-add')"
        @click="input?.click()"
      />
    </template>
    <p
      v-if="problem"
      class="text-sm text-error"
      role="alert"
    >
      {{ problem }}
    </p>
  </div>
</template>
