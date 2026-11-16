<!-- A fact another module adds to a record's summary strip. -->
<script setup lang="ts">
defineProps<{ recordId: string }>()
</script>

<template>
  <div>
    <dt class="text-xs text-muted">
      Seats held
    </dt>
    <dd class="font-medium text-highlighted">
      12 for {{ recordId }}
    </dd>
  </div>
</template>
