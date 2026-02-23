<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['staff'],
})

// Redirect to the main FoH interface
await navigateTo('/admin/box-office/reservations', { replace: true })
</script>
