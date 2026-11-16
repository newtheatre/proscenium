<script setup lang="ts">
definePageMeta({ layout: 'console' })

const { confirm } = useConfirm()
const undo = useUndo()
const answer = ref('')
const ok = useFetch('/api/gallery/items', { query: { size: 1 }, key: 'gallery:ok' })
const broken = useFetch('/api/gallery/nothing-here', { key: 'gallery:broken', retry: false })

async function cancel() {
  answer.value = await confirm({ verb: 'Cancel', thing: 'the 19:30 performance of Hamlet', consequence: '84 ticket holders will be emailed.', button: 'Cancel performance' }) ? 'cancelled' : 'kept'
}
</script>

<template>
  <PageFrame title="Sample feedback">
    <div class="space-y-6">
      <div class="flex flex-wrap items-center gap-3">
        <UButton
          label="Cancel a performance"
          color="error"
          @click="cancel"
        />
        <UButton
          label="Archive with undo"
          color="neutral"
          variant="outline"
          @click="undo.offer('Archived Hamlet', () => { answer = 'restored' })"
        />
        <p
          role="status"
          data-testid="answer"
        >
          {{ answer }}
        </p>
      </div>
      <DataBoundary
        :data="broken.data.value"
        :status="broken.status.value"
        :error="broken.error.value"
        @retry="broken.refresh()"
      >
        <p>never shown</p>
      </DataBoundary>
      <DataBoundary
        :data="ok.data.value"
        :status="ok.status.value"
        :error="ok.error.value"
        @retry="ok.refresh()"
      >
        <template #default="{ data }">
          <p>Loaded {{ data.total }} rows.</p>
        </template>
      </DataBoundary>
    </div>
  </PageFrame>
</template>
