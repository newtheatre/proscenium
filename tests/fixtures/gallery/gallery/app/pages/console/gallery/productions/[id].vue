<script setup lang="ts">
definePageMeta({ layout: 'console' })
const route = useRoute()
const id = String(route.params.id)
const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'details', label: 'Details' }, { id: 'forms', label: 'Forms' }]
</script>

<template>
  <PageRecord
    title="Hamlet"
    :trail="[{ label: 'Sample list', to: '/console/gallery/list' }]"
    :status="{ label: 'On sale', tone: 'success' }"
    :primary="{ label: 'Open the form', to: '/console/gallery/form' }"
    :actions="[[{ label: 'Duplicate' }], [{ label: 'Delete production', color: 'error' }]]"
    :summary="[{ label: 'Performances', value: '12' }, { label: 'Seats sold', value: '348' }, { label: 'Opens', value: '3 March' }]"
    record-type="gallery.production"
    :record-id="id"
    :tabs="tabs"
  >
    <template #tab-overview>
      <p>Overview of {{ id }}.</p>
    </template>
    <template #tab-details>
      <p>Details of {{ id }}.</p>
    </template>
    <template #tab-forms>
      <FormsSlotForms
        slot-id="gallery.show-feedback"
        :subject="id"
      />
    </template>
  </PageRecord>
</template>
